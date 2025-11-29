import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * ProbeEngineV2 - Per-Field Probing for PACK_LE_APPS (MVP v0.2)
 * 
 * Features:
 * - Validates each field immediately after deterministic answer
 * - Probes until valid answer or max probes reached
 * - Returns NEXT_FIELD when field is complete
 * - NOW USES: GlobalSettings.ai_default_probing_instructions
 * - NOW USES: GlobalSettings AI runtime config (model, temperature, max_tokens, top_p)
 * - NOW USES: FollowUpPack.ai_probe_instructions via InvokeLLM
 * - Falls back to static probes if LLM fails
 */

// Default max probes fallback - only used if pack entity doesn't have max_ai_followups set
const DEFAULT_MAX_PROBES_FALLBACK = 3;

/**
 * Helper to detect "I don't recall / remember / know" style answers
 * Used to force probing even if field-specific validation might accept the value
 */
function answerLooksLikeNoRecall(rawAnswer) {
  if (!rawAnswer) return false;
  const text = String(rawAnswer).trim().toLowerCase();

  if (!text) return false;

  // Common "no memory / unknown" phrases
  const patterns = [
    "i don't know",
    "i dont know",
    "idk",
    "i don't recall",
    "i dont recall",
    "i don't remember",
    "i dont remember",
    "not sure",
    "unsure",
    "unknown",
    "can't remember",
    "cant remember",
    "no idea",
    "i do not know",
    "i do not recall",
    "i do not remember",
    "cannot remember",
    "cannot recall",
    "i'm not sure",
    "im not sure"
  ];

  const result = patterns.some(p => text.includes(p));
  if (result) {
    console.log(`[V2-SEMANTIC] answerLooksLikeNoRecall: detected "no recall" pattern in "${text.substring(0, 50)}..."`);
  }
  return result;
}

/**
 * Get AI runtime configuration from GlobalSettings with safe defaults
 * Single source of truth for all LLM parameters
 */
function getAiRuntimeConfig(globalSettings) {
  return {
    model: globalSettings?.ai_model || "gpt-4o-mini",
    temperature: globalSettings?.ai_temperature ?? 0.2,
    max_tokens: globalSettings?.ai_max_tokens ?? 512,
    top_p: globalSettings?.ai_top_p ?? 1,
  };
}

/**
 * Build unified AI instructions for per-field probing (same pattern as interviewAiFollowup.js)
 * Layers: Core rules → GlobalSettings → FollowUpPack → Field-specific context
 * Returns: { instructions: string, aiConfig: object }
 */
async function buildFieldProbeInstructions(base44Client, packId, fieldName, fieldLabel, maxProbes) {
  const coreRules = `You are a ClearQuest Background Investigation AI Assistant conducting law enforcement background investigations.

CORE SYSTEM RULES (ALWAYS APPLY):
- All information is strictly confidential and CJIS-compliant
- Maintain professional, non-judgmental tone at all times
- Never make hiring recommendations or conclusions
- Focus on factual, objective information gathering
- Respect the sensitivity of personal disclosures`;

  let instructions = coreRules + '\n\n';
  let aiConfig = getAiRuntimeConfig(null); // Defaults

  try {
    // Fetch GlobalSettings and FollowUpPack in parallel
    const [globalSettingsResult, packResult] = await Promise.all([
      base44Client.entities.GlobalSettings.filter({ settings_id: 'global' }).catch(() => []),
      packId 
        ? base44Client.entities.FollowUpPack.filter({ followup_pack_id: packId, active: true }).catch(() => [])
        : Promise.resolve([])
    ]);

    const settings = globalSettingsResult.length > 0 ? globalSettingsResult[0] : null;
    const pack = packResult.length > 0 ? packResult[0] : null;

    // Get AI runtime config from GlobalSettings
    aiConfig = getAiRuntimeConfig(settings);
    console.log(`[V2-PER-FIELD] AI Config: model=${aiConfig.model}, temp=${aiConfig.temperature}, max_tokens=${aiConfig.max_tokens}, top_p=${aiConfig.top_p}`);

    // Layer 1: Global probing instructions from AI Settings page
    if (settings?.ai_default_probing_instructions) {
      instructions += '=== GLOBAL PROBING GUIDELINES ===\n';
      instructions += settings.ai_default_probing_instructions + '\n\n';
      console.log(`[V2-PER-FIELD] Loaded GlobalSettings.ai_default_probing_instructions (${settings.ai_default_probing_instructions.length} chars)`);
    } else {
      console.log(`[V2-PER-FIELD] No GlobalSettings.ai_default_probing_instructions found`);
    }

    // Layer 2: Pack-specific probing instructions
    if (pack?.ai_probe_instructions) {
      instructions += '=== PACK-SPECIFIC PROBING INSTRUCTIONS ===\n';
      instructions += pack.ai_probe_instructions + '\n\n';
      console.log(`[V2-PER-FIELD] Loaded FollowUpPack.ai_probe_instructions for ${packId} (${pack.ai_probe_instructions.length} chars)`);
    } else {
      console.log(`[V2-PER-FIELD] No FollowUpPack.ai_probe_instructions found for ${packId}`);
    }

    // Layer 3: Per-field probing task instructions
    instructions += '=== PER-FIELD PROBING TASK ===\n';
    instructions += `You are generating a follow-up question for a SINGLE FIELD that the candidate left incomplete or vague.\n`;
    instructions += `Field being probed: "${fieldLabel || fieldName}"\n`;
    instructions += `Your goal: Get a clear, specific answer for this field only.\n\n`;
    
    instructions += '=== PROBING LIMITS ===\n';
    instructions += `- Ask ONE concise, specific follow-up question about this field.\n`;
    instructions += `- You may ask up to ${maxProbes} probing questions for this field.\n`;
    instructions += `- Keep questions brief (under 30 words).\n`;
    instructions += `- Be professional and non-judgmental.\n`;
    instructions += `- Focus on gathering factual details.\n`;
    instructions += `- Follow all date rules: ask for month/year only, never exact dates.\n\n`;

    instructions += '=== OUTPUT FORMAT ===\n';
    instructions += `Respond with ONLY the question text. No preamble, no explanation, just the question.\n`;

  } catch (err) {
    console.error('[V2-PER-FIELD] Error building instructions:', err.message);
  }

  return { instructions, aiConfig };
}

/**
 * Deterministic fallback probes for all supported fields.
 * Used when AI/validation fails to ensure probing is rock-solid.
 * 
 * For PACK_DRIVING_COLLISION_STANDARD Q01 (collision date), we use a multi-level
 * probing strategy that acknowledges "I don't recall" and helps narrow down the timeframe.
 */
const FALLBACK_PROBES = {
  // === PACK_LE_APPS ===
  "PACK_LE_APPS_Q1": "Since you're not sure of the exact name, please describe the law enforcement agency you applied to. Include anything you remember, such as the city, state, or any identifying details.",
  "PACK_LE_APPS_Q1764025170356": "What position were you applying for at that agency? For example, was it a police officer, deputy sheriff, corrections officer, or another role?",
  "PACK_LE_APPS_Q1764025187292": "We need at least an approximate timeframe for this application. Can you give us an estimate, like 'around 2020' or 'early 2019'?",
  "PACK_LE_APPS_Q1764025199138": "What was the final result of your application? Were you hired, not selected, did you withdraw, or is it still pending?",
  "PACK_LE_APPS_Q1764025212764": "Were you given any reason for why you were not selected? This could include failing a test, background issues, or the agency's decision.",
  "PACK_LE_APPS_Q1764025246583": "You indicated there were issues during this hiring process. Please describe what those issues or concerns were.",
  
  // === PACK_DRIVING_COLLISION_STANDARD ===
  // NOTE: Q01 uses MULTI_LEVEL_PROBES below instead for smarter probing
  "PACK_DRIVING_COLLISION_Q02": "Where did this collision take place? Please describe the location.",
  "PACK_DRIVING_COLLISION_Q03": "Please describe what happened in this collision. How did the accident occur?",
  "PACK_DRIVING_COLLISION_Q04": "Were you determined to be at fault for this collision?",
  "PACK_DRIVING_COLLISION_Q05": "Were there any injuries as a result of this collision?",
  "PACK_DRIVING_COLLISION_Q06": "Was there property damage as a result of this collision?",
  "PACK_DRIVING_COLLISION_Q07": "Were any citations or tickets issued as a result of this collision?",
  "PACK_DRIVING_COLLISION_Q08": "Was alcohol or any other substance involved in this collision?",
};

/**
 * Multi-level probing for specific fields that need smarter, scaffolded questions.
 * Returns a question based on probeCount (0, 1, 2, ...).
 * 
 * For collision dates, we:
 * - Probe 1: Acknowledge "I don't recall" and ask for approximate year
 * - Probe 2: Anchor to life events to help narrow down
 * - Probe 3: Accept a broad range as final answer
 */
const MULTI_LEVEL_PROBES = {
  "PACK_DRIVING_COLLISION_Q01": [
    // Probe 1 (probeCount=0): Acknowledge and narrow to year
    "I understand you don't recall the exact date. Even if you're not sure of the month, what's the closest you can get to the year? For example, was it closer to 2010, 2015, 2020, or another timeframe?",
    // Probe 2 (probeCount=1): Anchor to life events
    "Think about what was going on in your life at the time of this collision—where you were living, what job you had, or any major life events happening then. Does that help you narrow down an approximate year or season?",
    // Probe 3 (probeCount=2): Accept broad range
    "If you still can't pinpoint a specific year, that's okay. Please give your best estimate as a range, like 'sometime between 2010 and 2015' or 'early 2020s'. Any approximate timeframe will help."
  ],
  "PACK_DRIVING_COLLISION_Q05": [
    // Probe 1 (probeCount=0): Clarify "not sure" / basic injuries
    "You mentioned you're not sure about injuries. Think back to the collision: did anyone complain of pain, soreness, or stiffness afterward — including you, your passengers, or people in the other vehicle?",
    // Probe 2 (probeCount=1): Who was affected
    "To the best of your memory, did anyone see a doctor, go to the hospital, or miss work or school because of this collision? If so, who was it — you, a passenger, or someone in the other vehicle?",
    // Probe 3 (probeCount=2): How serious
    "Even if you can't remember exact details, give your best estimate of how serious any injuries were — for example, 'minor soreness only', 'possible whiplash', or 'someone went to the ER'."
  ],
  // Add more multi-level fields here as needed
};

/**
 * Get the appropriate fallback probe for a field, considering probeCount for multi-level fields.
 */
function getFallbackProbeForField(fieldKey, probeCount = 0) {
  // Check if this field has multi-level probes
  if (MULTI_LEVEL_PROBES[fieldKey]) {
    const probes = MULTI_LEVEL_PROBES[fieldKey];
    // Use the probe at the current count, or the last one if we've exceeded
    const index = Math.min(probeCount, probes.length - 1);
    return probes[index];
  }
  
  // Fall back to single static probe
  return FALLBACK_PROBES[fieldKey] || null;
}

// Merge additional fallback probes into main object
Object.assign(FALLBACK_PROBES, {
  // === PACK_DRIVING_VIOLATIONS_STANDARD ===
  "PACK_DRIVING_VIOLATIONS_Q01": "When did this violation occur? Please provide at least the month and year.",
  "PACK_DRIVING_VIOLATIONS_Q02": "What type of violation was this? For example, speeding, running a red light, etc.",
  "PACK_DRIVING_VIOLATIONS_Q03": "Where did this violation occur?",
  "PACK_DRIVING_VIOLATIONS_Q04": "What was the outcome of this violation? Was it paid, dismissed, reduced, or contested?",
  "PACK_DRIVING_VIOLATIONS_Q05": "Were there any fines associated with this violation?",
  "PACK_DRIVING_VIOLATIONS_Q06": "Were any points added to your driving record?",
  
  // === PACK_DRIVING_STANDARD ===
  "PACK_DRIVING_STANDARD_Q01": "When did this incident occur? Please provide at least the month and year.",
  "PACK_DRIVING_STANDARD_Q02": "What type of driving incident was this?",
  "PACK_DRIVING_STANDARD_Q03": "Please describe what happened in this incident.",
  "PACK_DRIVING_STANDARD_Q04": "What was the outcome of this incident?",
  
  // === PACK_INTEGRITY_APPS ===
  "agency_name": "Which agency were you applying with when this issue occurred?",
  "incident_date": "When did this occur? Please provide at least the month and year.",
  "what_omitted": "Can you describe what specific information was incomplete or inaccurate on the application?",
  "reason_omitted": "What led you to leave that information off or answer it the way you did?",
  "discovery_method": "How did this issue come to light — did you disclose it yourself, or was it found during the background?",
  "consequences": "What consequences or disciplinary action resulted from this?",
  "corrected": "Has this been addressed or corrected since then?",
  
  // === PACK_LE_MISCONDUCT_STANDARD ===
  "position_held": "What was your position or rank at that agency?",
  "employment_dates": "When were you employed there? Please provide approximate years.",
  "allegation_type": "What type of allegation or concern was this?",
  "allegation_description": "Can you describe what was alleged?",
  "ia_case_number": "Do you recall an Internal Affairs case number or reference?",
  "finding": "What was the official finding — sustained, not sustained, exonerated, or something else?",
  "discipline": "What discipline, if any, resulted from this?",
  "appealed": "Did you appeal or contest the outcome?",
  
  // === PACK_WORKPLACE_STANDARD ===
  "employer": "What company or organization were you working for when this incident occurred?",
  "position_at_time": "What was your job title or position when this happened?",
  "misconduct_type": "What type of issue was this — for example, a policy violation, dishonesty, conflict, or something else?",
  "incident_description": "Can you describe what happened in this incident?",
  "corrective_action": "What action did your employer take — for example, a warning, suspension, or termination?",
  "separation_type": "How did your employment end at this job — did you leave voluntarily, resign under pressure, or were you terminated?",
  "official_reason": "What reason did the employer give for any disciplinary action or separation?",
  "isolated_or_recurring": "Was this a one-time incident or part of a recurring pattern?",
  "impact": "What impact, if any, did this have on the workplace or your colleagues?",
  "remediation": "What steps have you taken since this incident to address or prevent similar issues?",
  
  // === PACK_INTEGRITY_APPS ===
  "position_applied_for": "What position were you applying for at that agency?",
  "issue_type": "What type of integrity issue was this — an omission, misstatement, falsification, or something else?",
  "what_omitted": "Can you describe what specific information was incomplete or inaccurate on the application?",
  "reason_omitted": "What led you to leave that information off or answer it the way you did?",
  "consequences": "What consequences resulted from this — were you removed from the process, allowed to continue, or something else?",
  "corrected": "Have you since disclosed this information on other applications?",
  "remediation_steps": "What steps have you taken to ensure accurate applications going forward?",
  
  // === PACK_LE_APPS ===
  "agency_location": "What city, county, or state is that agency located in?",
  "background_issues": "Were any background issues cited during your application process? If so, please briefly describe.",
  
  // === PACK_LE_MISCONDUCT_STANDARD ===
  "allegation_description": "Can you describe what was alleged?",
  
  // === PACK_FINANCIAL_STANDARD ===
  "financial_issue_type": "What type of financial issue was this — bankruptcy, collections, repossession, unpaid taxes, or something else?",
  "most_recent_date": "When was the most recent occurrence or action related to this issue?",
  "amount_owed": "Approximately how much was owed or affected?",
  "creditor": "Who was the creditor or agency involved?",
  "legal_actions": "Were there any legal actions taken, such as liens, garnishments, or judgments?",
  "employment_impact": "Did this issue have any impact on your employment, security clearance, or licensing?",
  "resolution_steps": "What steps have you taken to resolve this issue?",
  "resolution_status": "What is the current status — fully resolved, in repayment, still outstanding, or something else?",
  "remaining_obligations": "Are there any remaining debts or obligations from this issue?",
  
  // === PACK_GANG_STANDARD ===
  "gang_name": "What was the gang or group called, or how would you describe it?",
  "end_date": "When did your involvement with this group end?",
  "involvement_level": "How would you describe your level of involvement — were you an observer, associate, active participant, or member?",
  "origin_story": "How did you first become involved with this group?",
  "activities": "What activities did you observe or participate in while involved?",
  "illegal_activity": "Were you involved in or did you witness any illegal activity during this time?",
  "post_exit_contact": "Have you had any contact with members of this group since you separated?",
  
  // === PACK_MILITARY_STANDARD ===
  "branch": "Which branch of military service were you in at the time of this incident?",
  "rank_role": "What was your rank and duty position when this occurred?",
  "incident_date": "When did this incident occur? Please provide at least an approximate month and year.",
  "location": "Where did this incident take place?",
  "description": "Can you describe what happened?",
  "orders_violation": "What orders, regulations, or standards were involved?",
  "alcohol_drugs": "Were alcohol, drugs, or stress factors involved in this incident?",
  "disciplinary_action": "What disciplinary action was taken as a result?",
  "career_impact": "How did this affect your rank, clearance, or military career?",
  "remediation_steps": "What steps have you taken since this incident to address the issue?",
  
  // === PACK_WEAPONS_STANDARD ===
  "weapon_type": "What type of weapon was involved in this incident?",
  "weapon_ownership": "Did you own or possess this weapon, or did it belong to someone else?",
  "weapon_use": "How was the weapon used, carried, or displayed during this incident?",
  "threats": "Were there any threats made or danger posed to others during this incident?",
  "discharge": "Was the weapon discharged, either intentionally or accidentally?",
  "actions_taken": "What actions were taken afterward — such as arrest, charges, or discipline?",
  
  // === PACK_SEX_ADULT_STANDARD ===
  "type": "What type of misconduct was this incident?",
  "when": "When did this incident occur? Please provide at least the month and year.",
  "where": "Where did this incident take place?",
  "consensual": "Was the conduct consensual between the adults involved?",
  "environment": "What was the setting or environment where this occurred?",
  "authority_awareness": "Were any authorities, supervisors, or employers made aware of this incident?",
  "consequences": "What consequences or actions resulted from this incident?",
  
  // === PACK_NON_CONSENT_STANDARD ===
  "incident_type": "What type of incident was this?",
  "date": "When did this incident occur? Please provide at least the month and year.",
  "location": "Where did this incident take place?",
  "other_party": "What was your relationship to the other person involved?",
  "narrative": "Can you provide a high-level summary of what occurred?",
  "coercion": "Was there any force, intimidation, or coercion involved?",
  "consent_signals": "Were there any signals indicating lack of consent?",
  "injuries": "Were any injuries reported as a result of this incident?",
  "legal_action": "Was there any police, employer, or school involvement or action taken?",
  
  // === PACK_DRUG_SALE_STANDARD ===
  "substance_type": "What type of substance was involved?",
  "role": "What was your role or involvement in this activity?",
  "approx_date": "When did this occur? Please provide at least the month and year, or your approximate age.",
  "frequency": "How often did this occur, or how many times?",
  "associates": "Were other people involved? If so, what were their roles?",
  "compensation": "Was there any profit, compensation, or financial gain?",
  "weapons_violence": "Were any weapons or violence involved?",
  "law_enforcement_involved": "Was law enforcement ever involved or aware of this activity?",
  "arrested_charged": "Were you ever arrested or charged in connection with this activity?",
  "disclosed_prior": "Have you previously disclosed this on any application or background investigation?",
  "recurrence": "Has this type of activity occurred again since?",
  "prevention_steps": "What steps have you taken to ensure this does not happen again?",
  
  // === PACK_DRUG_USE_STANDARD ===
  "first_use_date": "When did you first use this substance? Please provide at least the month and year.",
  "last_use_date": "When was the most recent time you used this substance?",
  "total_uses": "About how many times in total have you used this substance?",
  "use_context": "What was the setting or situation when you used this substance?",
  "use_location": "Where did you typically use this substance?",
  "obtain_method": "How did you obtain this substance?",
  "under_influence_in_prohibited_setting": "Were you ever under the influence of this substance in a prohibited setting?",
  "consequences": "Did this cause any legal, school, or employment issues?",
  "prior_disclosure": "Have you disclosed this to any prior employer or agency?",
  "other_substances_used": "Were there other related substances you also used?",
  "behavior_stopped": "Has this behavior stopped? If so, when?",
  "mitigation_steps": "What steps have you taken to avoid future use?"
});

/**
 * Build a deterministic fallback probe for specific fields when AI/validation fails.
 * This ensures probing is rock-solid even when the backend has issues.
 * Supports PACK_LE_APPS, PACK_INTEGRITY_APPS, PACK_LE_MISCONDUCT_STANDARD, and driving packs.
 * 
 * Now uses multi-level probing for fields that have it configured.
 */
function buildFallbackProbeForField({ packId, fieldKey, semanticField, probeCount = 0 }) {
  // Check if we have a multi-level or static fallback for this specific field key
  const fallbackQuestion = getFallbackProbeForField(fieldKey, probeCount);
  if (fallbackQuestion) {
    return {
      mode: "QUESTION",
      question: fallbackQuestion,
      isFallback: true,
      probeSource: MULTI_LEVEL_PROBES[fieldKey] ? 'fallback_multi_level' : 'fallback_static'
    };
  }
  
  // Try using semantic field name for fallback (for any supported pack)
  const supportedPacks = ["PACK_LE_APPS", "PACK_INTEGRITY_APPS", "PACK_LE_MISCONDUCT_STANDARD", "PACK_DRIVING_COLLISION_STANDARD", "PACK_DRIVING_VIOLATIONS_STANDARD", "PACK_DRIVING_STANDARD", "PACK_WORKPLACE_STANDARD", "PACK_FINANCIAL_STANDARD", "PACK_GANG_STANDARD", "PACK_MILITARY_STANDARD", "PACK_WEAPONS_STANDARD", "PACK_SEX_ADULT_STANDARD", "PACK_NON_CONSENT_STANDARD", "PACK_DRUG_SALE_STANDARD", "PACK_DRUG_USE_STANDARD"];
  if (supportedPacks.includes(packId) && semanticField) {
    const staticFallback = getStaticFallbackQuestion(semanticField, probeCount, null, {});
    if (staticFallback && !staticFallback.includes('provide more details about')) {
      return {
        mode: "QUESTION",
        question: staticFallback,
        isFallback: true,
        probeSource: 'fallback_semantic'
      };
    }
  }

  // No fallback configured for this field
  return null;
}

const PACK_CONFIG = {
  PACK_LE_APPS: {
    id: "PACK_LE_APPS",
    // NOTE: maxProbesPerField is now fetched from FollowUpPack entity (max_ai_followups)
    // This local config is only used for field mapping
    requiredFields: ["agency_name", "agency_location", "application_date", "position", "outcome", "stage_reached", "reason_not_selected", "full_disclosure"],
    priorityOrder: ["agency_name", "agency_location", "application_date", "position", "outcome", "stage_reached", "reason_not_selected", "full_disclosure"],
    fieldKeyMap: {
      // Legacy mappings
      "PACK_LE_APPS_Q1": "agency_name",
      "PACK_LE_APPS_Q1764025170356": "position",
      "PACK_LE_APPS_Q1764025187292": "application_date",
      "PACK_LE_APPS_Q1764025199138": "outcome",
      "PACK_LE_APPS_Q1764025212764": "reason_not_selected",
      "PACK_LE_APPS_Q1764025246583": "stage_reached",
      // New field_config mappings
      "agency_name": "agency_name",
      "agency_location": "agency_location",
      "application_date": "application_date",
      "position": "position",
      "outcome": "outcome",
      "stage_reached": "stage_reached",
      "reason_not_selected": "reason_not_selected",
      "full_disclosure": "full_disclosure",
      "has_documentation": "has_documentation",
      // Legacy semantic aliases
      "agency": "agency_name",
      "monthYear": "application_date",
      "reason": "reason_not_selected",
      "stageReached": "stage_reached",
    },
  },
  
  // Application Integrity Issues pack
  PACK_INTEGRITY_APPS: {
    id: "PACK_INTEGRITY_APPS",
    requiredFields: ["agency_name", "incident_date", "issue_type", "what_omitted", "reason_omitted", "discovery_method", "corrected"],
    priorityOrder: ["agency_name", "incident_date", "issue_type", "what_omitted", "reason_omitted", "discovery_method", "consequences", "corrected"],
    fieldKeyMap: {
      "agency_name": "agency_name",
      "incident_date": "incident_date",
      "issue_type": "issue_type",
      "what_omitted": "what_omitted",
      "reason_omitted": "reason_omitted",
      "discovery_method": "discovery_method",
      "consequences": "consequences",
      "corrected": "corrected",
      // Legacy question mappings
      "PACK_INTEGRITY_APPS_Q01": "agency_name",
      "PACK_INTEGRITY_APPS_Q02": "incident_date",
      "PACK_INTEGRITY_APPS_Q03": "what_omitted",
      "PACK_INTEGRITY_APPS_Q04": "reason_omitted",
      "PACK_INTEGRITY_APPS_Q05": "discovery_method",
      "PACK_INTEGRITY_APPS_Q06": "consequences",
      "PACK_INTEGRITY_APPS_Q07": "corrected",
    },
  },
  
  // Prior LE Misconduct pack
  PACK_LE_MISCONDUCT_STANDARD: {
    id: "PACK_LE_MISCONDUCT_STANDARD",
    requiredFields: ["agency_name", "position_held", "employment_dates", "incident_date", "allegation_type", "allegation_description", "discovery_method", "finding", "appealed"],
    priorityOrder: ["agency_name", "position_held", "employment_dates", "incident_date", "allegation_type", "allegation_description", "discovery_method", "ia_case_number", "finding", "discipline", "appealed", "has_documentation"],
    fieldKeyMap: {
      "agency_name": "agency_name",
      "position_held": "position_held",
      "employment_dates": "employment_dates",
      "incident_date": "incident_date",
      "allegation_type": "allegation_type",
      "allegation_description": "allegation_description",
      "discovery_method": "discovery_method",
      "ia_case_number": "ia_case_number",
      "finding": "finding",
      "discipline": "discipline",
      "appealed": "appealed",
      "has_documentation": "has_documentation",
      // Legacy question mappings
      "PACK_LE_MISCONDUCT_Q01": "agency_name",
      "PACK_LE_MISCONDUCT_Q02": "position_held",
      "PACK_LE_MISCONDUCT_Q03": "incident_date",
      "PACK_LE_MISCONDUCT_Q04": "allegation_type",
      "PACK_LE_MISCONDUCT_Q05": "allegation_description",
      "PACK_LE_MISCONDUCT_Q06": "finding",
      "PACK_LE_MISCONDUCT_Q07": "discipline",
    },
  },
  
  // Driving collision pack
  PACK_DRIVING_COLLISION_STANDARD: {
    id: "PACK_DRIVING_COLLISION_STANDARD",
    requiredFields: ["collisionDate", "collisionLocation", "collisionDescription", "atFault", "injuries", "propertyDamage", "citations", "alcoholInvolved"],
    priorityOrder: ["collisionDate", "collisionLocation", "collisionDescription", "atFault", "injuries", "propertyDamage", "citations", "alcoholInvolved"],
    fieldKeyMap: {
      "PACK_DRIVING_COLLISION_Q01": "collisionDate",
      "PACK_DRIVING_COLLISION_Q02": "collisionLocation",
      "PACK_DRIVING_COLLISION_Q03": "collisionDescription",
      "PACK_DRIVING_COLLISION_Q04": "atFault",
      "PACK_DRIVING_COLLISION_Q05": "injuries",
      "PACK_DRIVING_COLLISION_Q06": "propertyDamage",
      "PACK_DRIVING_COLLISION_Q07": "citations",
      "PACK_DRIVING_COLLISION_Q08": "alcoholInvolved",
      // Semantic field name mappings
      "collisionDate": "collisionDate",
      "collisionLocation": "collisionLocation",
      "collisionDescription": "collisionDescription",
      "atFault": "atFault",
      "injuries": "injuries",
      "propertyDamage": "propertyDamage",
      "citations": "citations",
      "alcoholInvolved": "alcoholInvolved",
    },
  },
  
  // Driving violations pack
  PACK_DRIVING_VIOLATIONS_STANDARD: {
    id: "PACK_DRIVING_VIOLATIONS_STANDARD",
    requiredFields: ["violationDate", "violationType", "violationLocation", "outcome", "fines", "points"],
    priorityOrder: ["violationDate", "violationType", "violationLocation", "outcome", "fines", "points"],
    fieldKeyMap: {
      "PACK_DRIVING_VIOLATIONS_Q01": "violationDate",
      "PACK_DRIVING_VIOLATIONS_Q02": "violationType",
      "PACK_DRIVING_VIOLATIONS_Q03": "violationLocation",
      "PACK_DRIVING_VIOLATIONS_Q04": "outcome",
      "PACK_DRIVING_VIOLATIONS_Q05": "fines",
      "PACK_DRIVING_VIOLATIONS_Q06": "points",
      // Semantic field name mappings
      "violationDate": "violationDate",
      "violationType": "violationType",
      "violationLocation": "violationLocation",
      "outcome": "outcome",
      "fines": "fines",
      "points": "points",
    },
  },
  
  // General driving pack
  PACK_DRIVING_STANDARD: {
    id: "PACK_DRIVING_STANDARD",
    requiredFields: ["incidentDate", "incidentType", "incidentDescription", "outcome"],
    priorityOrder: ["incidentDate", "incidentType", "incidentDescription", "outcome"],
    fieldKeyMap: {
      "PACK_DRIVING_STANDARD_Q01": "incidentDate",
      "PACK_DRIVING_STANDARD_Q02": "incidentType",
      "PACK_DRIVING_STANDARD_Q03": "incidentDescription",
      "PACK_DRIVING_STANDARD_Q04": "outcome",
      // Semantic field name mappings
      "incidentDate": "incidentDate",
      "incidentType": "incidentType",
      "incidentDescription": "incidentDescription",
      "outcome": "outcome",
    },
  },
  
  // DUI/DWI pack
  PACK_DRIVING_DUIDWI_STANDARD: {
    id: "PACK_DRIVING_DUIDWI_STANDARD",
    requiredFields: ["incidentDate", "location", "substanceType", "stopReason", "testType", "testResult", "arrestStatus", "courtOutcome", "licenseImpact"],
    priorityOrder: ["incidentDate", "location", "substanceType", "stopReason", "testType", "testResult", "arrestStatus", "courtOutcome", "licenseImpact"],
    fieldKeyMap: {
      "PACK_DRIVING_DUIDWI_Q01": "incidentDate",
      "PACK_DRIVING_DUIDWI_Q02": "location",
      "PACK_DRIVING_DUIDWI_Q03": "substanceType",
      "PACK_DRIVING_DUIDWI_Q04": "stopReason",
      "PACK_DRIVING_DUIDWI_Q05": "testType",
      "PACK_DRIVING_DUIDWI_Q06": "testResult",
      "PACK_DRIVING_DUIDWI_Q07": "arrestStatus",
      "PACK_DRIVING_DUIDWI_Q08": "courtOutcome",
      "PACK_DRIVING_DUIDWI_Q09": "licenseImpact",
      // Semantic field name mappings
      "incidentDate": "incidentDate",
      "location": "location",
      "substanceType": "substanceType",
      "stopReason": "stopReason",
      "testType": "testType",
      "testResult": "testResult",
      "arrestStatus": "arrestStatus",
      "courtOutcome": "courtOutcome",
      "licenseImpact": "licenseImpact",
    },
  },
  
  // Workplace Integrity & Misconduct pack
  PACK_WORKPLACE_STANDARD: {
    id: "PACK_WORKPLACE_STANDARD",
    requiredFields: ["employer", "position_at_time", "incident_date", "misconduct_type", "incident_description", "corrective_action", "separation_type"],
    priorityOrder: ["employer", "position_at_time", "incident_date", "misconduct_type", "incident_description", "corrective_action", "separation_type", "official_reason", "isolated_or_recurring", "impact", "remediation"],
    fieldKeyMap: {
      "employer": "employer",
      "position_at_time": "position_at_time",
      "incident_date": "incident_date",
      "misconduct_type": "misconduct_type",
      "incident_description": "incident_description",
      "corrective_action": "corrective_action",
      "separation_type": "separation_type",
      "official_reason": "official_reason",
      "isolated_or_recurring": "isolated_or_recurring",
      "impact": "impact",
      "remediation": "remediation",
      // Legacy question mappings
      "PACK_WORKPLACE_STANDARD_Q01": "employer",
      "PACK_WORKPLACE_STANDARD_Q02": "position_at_time",
      "PACK_WORKPLACE_STANDARD_Q03": "incident_date",
      "PACK_WORKPLACE_STANDARD_Q04": "misconduct_type",
      "PACK_WORKPLACE_STANDARD_Q05": "incident_description",
      "PACK_WORKPLACE_STANDARD_Q06": "corrective_action",
      "PACK_WORKPLACE_STANDARD_Q07": "separation_type",
    },
  },
  
  // Application Integrity Issues pack (v2.4)
  PACK_INTEGRITY_APPS: {
    id: "PACK_INTEGRITY_APPS",
    requiredFields: ["agency_name", "incident_date", "issue_type", "what_omitted", "reason_omitted", "discovery_method", "consequences"],
    priorityOrder: ["agency_name", "position_applied_for", "incident_date", "issue_type", "what_omitted", "reason_omitted", "discovery_method", "consequences", "corrected", "remediation_steps"],
    fieldKeyMap: {
      "agency_name": "agency_name",
      "position_applied_for": "position_applied_for",
      "incident_date": "incident_date",
      "issue_type": "issue_type",
      "what_omitted": "what_omitted",
      "reason_omitted": "reason_omitted",
      "discovery_method": "discovery_method",
      "consequences": "consequences",
      "corrected": "corrected",
      "remediation_steps": "remediation_steps",
      // Legacy question mappings
      "PACK_INTEGRITY_APPS_Q01": "agency_name",
      "PACK_INTEGRITY_APPS_Q02": "incident_date",
      "PACK_INTEGRITY_APPS_Q03": "what_omitted",
      "PACK_INTEGRITY_APPS_Q04": "reason_omitted",
      "PACK_INTEGRITY_APPS_Q05": "discovery_method",
      "PACK_INTEGRITY_APPS_Q06": "consequences",
      "PACK_INTEGRITY_APPS_Q07": "corrected",
    },
  },
  
  // Law Enforcement Applications pack (v2.4)
  PACK_LE_APPS: {
    id: "PACK_LE_APPS",
    requiredFields: ["agency_name", "agency_location", "application_date", "position", "outcome"],
    priorityOrder: ["agency_name", "agency_location", "position", "application_date", "outcome", "stage_reached", "reason_not_selected", "background_issues", "full_disclosure", "has_documentation"],
    fieldKeyMap: {
      "agency_name": "agency_name",
      "agency_location": "agency_location",
      "position": "position",
      "application_date": "application_date",
      "outcome": "outcome",
      "stage_reached": "stage_reached",
      "reason_not_selected": "reason_not_selected",
      "background_issues": "background_issues",
      "full_disclosure": "full_disclosure",
      "has_documentation": "has_documentation",
      // Legacy question mappings
      "PACK_LE_APPS_Q1": "agency_name",
      "PACK_LE_APPS_Q1764025170356": "position",
      "PACK_LE_APPS_Q1764025187292": "application_date",
      "PACK_LE_APPS_Q1764025199138": "outcome",
      "PACK_LE_APPS_Q1764025212764": "reason_not_selected",
      "PACK_LE_APPS_Q1764025246583": "stage_reached",
      // Semantic aliases
      "agency": "agency_name",
      "monthYear": "application_date",
      "reason": "reason_not_selected",
      "stageReached": "stage_reached",
    },
  },
  
  // Prior Law Enforcement Misconduct pack (v2.4)
  PACK_LE_MISCONDUCT_STANDARD: {
    id: "PACK_LE_MISCONDUCT_STANDARD",
    requiredFields: ["agency_name", "position_held", "employment_dates", "incident_date", "allegation_type", "allegation_description", "discovery_method", "finding"],
    priorityOrder: ["agency_name", "position_held", "employment_dates", "incident_date", "allegation_type", "allegation_description", "discovery_method", "ia_case_number", "finding", "discipline", "separation_type", "appealed", "has_documentation", "remediation_steps"],
    fieldKeyMap: {
      "agency_name": "agency_name",
      "position_held": "position_held",
      "employment_dates": "employment_dates",
      "incident_date": "incident_date",
      "allegation_type": "allegation_type",
      "allegation_description": "allegation_description",
      "discovery_method": "discovery_method",
      "ia_case_number": "ia_case_number",
      "finding": "finding",
      "discipline": "discipline",
      "separation_type": "separation_type",
      "appealed": "appealed",
      "has_documentation": "has_documentation",
      "remediation_steps": "remediation_steps",
      // Legacy question mappings
      "PACK_LE_MISCONDUCT_Q01": "agency_name",
      "PACK_LE_MISCONDUCT_Q02": "position_held",
      "PACK_LE_MISCONDUCT_Q03": "incident_date",
      "PACK_LE_MISCONDUCT_Q04": "allegation_type",
      "PACK_LE_MISCONDUCT_Q05": "allegation_description",
      "PACK_LE_MISCONDUCT_Q06": "finding",
      "PACK_LE_MISCONDUCT_Q07": "discipline",
    },
  },
  
  // Financial Misconduct pack (v2.4)
  PACK_FINANCIAL_STANDARD: {
    id: "PACK_FINANCIAL_STANDARD",
    requiredFields: ["financial_issue_type", "start_date", "amount_owed", "resolution_steps", "resolution_status"],
    priorityOrder: ["financial_issue_type", "start_date", "most_recent_date", "amount_owed", "creditor", "legal_actions", "employment_impact", "resolution_steps", "resolution_status", "remaining_obligations", "prevention_steps"],
    fieldKeyMap: {
      "financial_issue_type": "financial_issue_type",
      "start_date": "start_date",
      "most_recent_date": "most_recent_date",
      "amount_owed": "amount_owed",
      "creditor": "creditor",
      "legal_actions": "legal_actions",
      "employment_impact": "employment_impact",
      "resolution_steps": "resolution_steps",
      "resolution_status": "resolution_status",
      "remaining_obligations": "remaining_obligations",
      "prevention_steps": "prevention_steps",
      // Legacy question mappings
      "PACK_FINANCIAL_STANDARD_Q01": "financial_issue_type",
      "PACK_FINANCIAL_STANDARD_Q02": "start_date",
      "PACK_FINANCIAL_STANDARD_Q03": "amount_owed",
      "PACK_FINANCIAL_STANDARD_Q04": "creditor",
      "PACK_FINANCIAL_STANDARD_Q05": "legal_actions",
      "PACK_FINANCIAL_STANDARD_Q06": "resolution_steps",
      "PACK_FINANCIAL_STANDARD_Q07": "resolution_status",
      "PACK_FINANCIAL_STANDARD_Q08": "prevention_steps",
    },
  },
  
  // Gang Membership / Affiliation pack (v2.4)
  PACK_GANG_STANDARD: {
    id: "PACK_GANG_STANDARD",
    requiredFields: ["gang_name", "start_date", "end_date", "involvement_level", "origin_story", "activities"],
    priorityOrder: ["gang_name", "start_date", "end_date", "involvement_level", "origin_story", "activities", "illegal_activity", "law_enforcement_contact", "post_exit_contact", "prevention_steps"],
    fieldKeyMap: {
      "gang_name": "gang_name",
      "start_date": "start_date",
      "end_date": "end_date",
      "involvement_level": "involvement_level",
      "origin_story": "origin_story",
      "activities": "activities",
      "illegal_activity": "illegal_activity",
      "law_enforcement_contact": "law_enforcement_contact",
      "post_exit_contact": "post_exit_contact",
      "prevention_steps": "prevention_steps",
      // Legacy question mappings
      "PACK_GANG_STANDARD_Q01": "gang_name",
      "PACK_GANG_STANDARD_Q02": "start_date",
      "PACK_GANG_STANDARD_Q03": "end_date",
      "PACK_GANG_STANDARD_Q04": "involvement_level",
      "PACK_GANG_STANDARD_Q05": "origin_story",
      "PACK_GANG_STANDARD_Q06": "activities",
      "PACK_GANG_STANDARD_Q07": "illegal_activity",
      "PACK_GANG_STANDARD_Q08": "law_enforcement_contact",
    },
  },
  
  // Military Misconduct / Discipline pack (v2.4)
  PACK_MILITARY_STANDARD: {
    id: "PACK_MILITARY_STANDARD",
    requiredFields: ["branch", "rank_role", "incident_date", "description", "disciplinary_action"],
    priorityOrder: ["branch", "rank_role", "incident_date", "location", "description", "orders_violation", "alcohol_drugs", "disciplinary_action", "career_impact", "law_enforcement_contact", "remediation_steps"],
    fieldKeyMap: {
      "branch": "branch",
      "rank_role": "rank_role",
      "incident_date": "incident_date",
      "location": "location",
      "description": "description",
      "orders_violation": "orders_violation",
      "alcohol_drugs": "alcohol_drugs",
      "disciplinary_action": "disciplinary_action",
      "career_impact": "career_impact",
      "law_enforcement_contact": "law_enforcement_contact",
      "remediation_steps": "remediation_steps",
      // Legacy question mappings
      "PACK_MILITARY_STANDARD_Q01": "branch",
      "PACK_MILITARY_STANDARD_Q02": "rank_role",
      "PACK_MILITARY_STANDARD_Q03": "incident_date",
      "PACK_MILITARY_STANDARD_Q04": "location",
      "PACK_MILITARY_STANDARD_Q05": "description",
      "PACK_MILITARY_STANDARD_Q06": "orders_violation",
      "PACK_MILITARY_STANDARD_Q07": "disciplinary_action",
      "PACK_MILITARY_STANDARD_Q08": "career_impact",
    },
  },
  
  // Weapons Misconduct pack (v2.4)
  PACK_WEAPONS_STANDARD: {
    id: "PACK_WEAPONS_STANDARD",
    requiredFields: ["weapon_type", "incident_date", "description", "weapon_use", "actions_taken"],
    priorityOrder: ["weapon_type", "weapon_ownership", "incident_date", "location", "description", "weapon_use", "threats", "discharge", "impairment", "actions_taken"],
    fieldKeyMap: {
      "weapon_type": "weapon_type",
      "weapon_ownership": "weapon_ownership",
      "incident_date": "incident_date",
      "location": "location",
      "description": "description",
      "weapon_use": "weapon_use",
      "threats": "threats",
      "discharge": "discharge",
      "impairment": "impairment",
      "actions_taken": "actions_taken",
      // Legacy question mappings
      "PACK_WEAPONS_STANDARD_Q01": "weapon_type",
      "PACK_WEAPONS_STANDARD_Q02": "weapon_ownership",
      "PACK_WEAPONS_STANDARD_Q03": "incident_date",
      "PACK_WEAPONS_STANDARD_Q04": "location",
      "PACK_WEAPONS_STANDARD_Q05": "description",
      "PACK_WEAPONS_STANDARD_Q06": "weapon_use",
      "PACK_WEAPONS_STANDARD_Q07": "threats",
      "PACK_WEAPONS_STANDARD_Q08": "actions_taken",
    },
  },
  
  // Adult Sexual Misconduct pack (v2.4)
  PACK_SEX_ADULT_STANDARD: {
    id: "PACK_SEX_ADULT_STANDARD",
    requiredFields: ["type", "when", "description", "consensual", "consequences"],
    priorityOrder: ["type", "when", "where", "consensual", "description", "impairment", "environment", "authority_awareness", "consequences"],
    fieldKeyMap: {
      "type": "type",
      "when": "when",
      "where": "where",
      "consensual": "consensual",
      "description": "description",
      "impairment": "impairment",
      "environment": "environment",
      "authority_awareness": "authority_awareness",
      "consequences": "consequences",
      // Legacy question mappings
      "PACK_SEX_ADULT_STANDARD_Q01": "type",
      "PACK_SEX_ADULT_STANDARD_Q02": "when",
      "PACK_SEX_ADULT_STANDARD_Q03": "where",
      "PACK_SEX_ADULT_STANDARD_Q04": "consensual",
      "PACK_SEX_ADULT_STANDARD_Q05": "description",
      "PACK_SEX_ADULT_STANDARD_Q06": "impairment",
      "PACK_SEX_ADULT_STANDARD_Q07": "environment",
      "PACK_SEX_ADULT_STANDARD_Q08": "consequences",
    },
  },
  
  // Sex Crimes / Non-Consent pack (v2.4)
  PACK_NON_CONSENT_STANDARD: {
    id: "PACK_NON_CONSENT_STANDARD",
    requiredFields: ["incident_type", "date", "narrative", "legal_action"],
    priorityOrder: ["incident_type", "date", "location", "other_party", "narrative", "coercion", "consent_signals", "impairment", "injuries", "legal_action"],
    fieldKeyMap: {
      "incident_type": "incident_type",
      "date": "date",
      "location": "location",
      "other_party": "other_party",
      "narrative": "narrative",
      "coercion": "coercion",
      "consent_signals": "consent_signals",
      "impairment": "impairment",
      "injuries": "injuries",
      "legal_action": "legal_action",
      // Legacy question mappings
      "PACK_NON_CONSENT_STANDARD_Q01": "incident_type",
      "PACK_NON_CONSENT_STANDARD_Q02": "date",
      "PACK_NON_CONSENT_STANDARD_Q03": "location",
      "PACK_NON_CONSENT_STANDARD_Q04": "other_party",
      "PACK_NON_CONSENT_STANDARD_Q05": "narrative",
      "PACK_NON_CONSENT_STANDARD_Q06": "coercion",
      "PACK_NON_CONSENT_STANDARD_Q07": "consent_signals",
      "PACK_NON_CONSENT_STANDARD_Q08": "legal_action",
    },
  },
  
  // Drug Sale / Manufacture / Trafficking pack (v2.4)
  PACK_DRUG_SALE_STANDARD: {
    id: "PACK_DRUG_SALE_STANDARD",
    requiredFields: ["substance_type", "role", "approx_date", "arrested_charged"],
    priorityOrder: ["substance_type", "role", "approx_date", "frequency", "location", "associates", "compensation", "weapons_violence", "law_enforcement_involved", "arrested_charged", "disclosed_prior", "recurrence", "coercion", "prevention_steps"],
    fieldKeyMap: {
      "substance_type": "substance_type",
      "role": "role",
      "approx_date": "approx_date",
      "frequency": "frequency",
      "location": "location",
      "associates": "associates",
      "compensation": "compensation",
      "weapons_violence": "weapons_violence",
      "law_enforcement_involved": "law_enforcement_involved",
      "arrested_charged": "arrested_charged",
      "disclosed_prior": "disclosed_prior",
      "recurrence": "recurrence",
      "coercion": "coercion",
      "prevention_steps": "prevention_steps",
      // Legacy question mappings
      "PACK_DRUG_SALE_STANDARD_Q01": "substance_type",
      "PACK_DRUG_SALE_STANDARD_Q02": "role",
      "PACK_DRUG_SALE_STANDARD_Q03": "approx_date",
      "PACK_DRUG_SALE_STANDARD_Q04": "frequency",
      "PACK_DRUG_SALE_STANDARD_Q05": "location",
      "PACK_DRUG_SALE_STANDARD_Q06": "associates",
      "PACK_DRUG_SALE_STANDARD_Q07": "compensation",
      "PACK_DRUG_SALE_STANDARD_Q08": "weapons_violence",
      "PACK_DRUG_SALE_STANDARD_Q09": "law_enforcement_involved",
      "PACK_DRUG_SALE_STANDARD_Q10": "arrested_charged",
      "PACK_DRUG_SALE_STANDARD_Q11": "disclosed_prior",
      "PACK_DRUG_SALE_STANDARD_Q12": "recurrence",
      "PACK_DRUG_SALE_STANDARD_Q13": "coercion",
      "PACK_DRUG_SALE_STANDARD_Q14": "prevention_steps",
    },
  },
  
  // Illegal Drug Use / Experimentation pack (v2.4)
  PACK_DRUG_USE_STANDARD: {
    id: "PACK_DRUG_USE_STANDARD",
    requiredFields: ["substance_type", "first_use_date", "last_use_date", "total_uses"],
    priorityOrder: ["substance_type", "first_use_date", "last_use_date", "total_uses", "use_context", "use_location", "obtain_method", "under_influence_in_prohibited_setting", "consequences", "law_enforcement_involved", "prior_disclosure", "other_substances_used", "behavior_stopped", "mitigation_steps"],
    fieldKeyMap: {
      "substance_type": "substance_type",
      "first_use_date": "first_use_date",
      "last_use_date": "last_use_date",
      "total_uses": "total_uses",
      "use_context": "use_context",
      "use_location": "use_location",
      "obtain_method": "obtain_method",
      "under_influence_in_prohibited_setting": "under_influence_in_prohibited_setting",
      "consequences": "consequences",
      "law_enforcement_involved": "law_enforcement_involved",
      "prior_disclosure": "prior_disclosure",
      "other_substances_used": "other_substances_used",
      "behavior_stopped": "behavior_stopped",
      "mitigation_steps": "mitigation_steps",
      // Legacy question mappings
      "PACK_DRUG_USE_STANDARD_Q01": "substance_type",
      "PACK_DRUG_USE_STANDARD_Q02": "first_use_date",
      "PACK_DRUG_USE_STANDARD_Q03": "last_use_date",
      "PACK_DRUG_USE_STANDARD_Q04": "total_uses",
      "PACK_DRUG_USE_STANDARD_Q05": "use_context",
      "PACK_DRUG_USE_STANDARD_Q06": "use_location",
      "PACK_DRUG_USE_STANDARD_Q07": "obtain_method",
      "PACK_DRUG_USE_STANDARD_Q08": "under_influence_in_prohibited_setting",
      "PACK_DRUG_USE_STANDARD_Q09": "consequences",
      "PACK_DRUG_USE_STANDARD_Q10": "law_enforcement_involved",
      "PACK_DRUG_USE_STANDARD_Q11": "prior_disclosure",
      "PACK_DRUG_USE_STANDARD_Q12": "other_substances_used",
      "PACK_DRUG_USE_STANDARD_Q13": "behavior_stopped",
      "PACK_DRUG_USE_STANDARD_Q14": "mitigation_steps",
    },
  },
};

/**
 * Normalize curly quotes and trim
 */
function normalizeText(raw) {
  if (raw == null) return "";
  return String(raw)
    .replace(/\u2019/g, "'")
    .replace(/\u2018/g, "'")
    .replace(/\u201C/g, '"')
    .replace(/\u201D/g, '"')
    .trim();
}

/**
 * Check if value indicates "I don't know/remember"
 */
function isDontKnow(value) {
  const normalized = normalizeText(value).toLowerCase();
  console.log(`[V2-PER-FIELD] isDontKnow check: raw="${value}", normalized="${normalized}"`);
  
  if (!normalized) {
    console.log(`[V2-PER-FIELD] isDontKnow: empty/null → true`);
    return true;
  }
  
  const dontKnowPhrases = [
    "i don't remember", "dont remember", "i do not remember", "don't remember",
    "don't recall", "dont recall", "i do not recall", "i don't recall",
    "not sure", "i'm not sure", "im not sure", "unknown", "n/a", "na",
    "can't remember", "cant remember", "cannot remember",
    "can't recall", "cant recall", "cannot recall",
    "unsure", "no idea", "i don't know", "dont know", "do not know", "idk"
  ];
  
  const result = dontKnowPhrases.some(phrase => normalized.includes(phrase));
  console.log(`[V2-PER-FIELD] isDontKnow: result=${result} for "${normalized}"`);
  return result;
}

/**
 * v2-Semantic evaluation for a single field answer.
 * This is global / pack-agnostic and should work for all packs.
 *
 * Returns a structured object:
 * {
 *   status: "ok" | "needs_probe",
 *   reason: "EMPTY" | "NO_RECALL" | "FIELD_RULES_OK",
 *   flags: {
 *     isEmpty: boolean,
 *     isNoRecall: boolean
 *   }
 * }
 */
function semanticV2EvaluateAnswer(fieldName, rawValue, incidentContext = {}) {
  const normalized = normalizeText(rawValue).toLowerCase();

  const isEmpty = !normalized;
  const isNoRecall = isDontKnow(rawValue) || answerLooksLikeNoRecall(rawValue);

  let status = "ok";
  let reason = "FIELD_RULES_OK";

  if (isEmpty) {
    status = "needs_probe";
    reason = "EMPTY";
  } else if (isNoRecall) {
    status = "needs_probe";
    reason = "NO_RECALL";
  }

  console.log(`[V2-SEMANTIC] semanticV2EvaluateAnswer`, {
    fieldName,
    rawValue,
    normalized,
    status,
    reason,
    flags: { isEmpty, isNoRecall }
  });

  return {
    status,
    reason,
    flags: {
      isEmpty,
      isNoRecall,
    },
  };
}

/**
 * Validate a specific field value
 * Returns: "complete", "incomplete", or "invalid"
 * 
 * Supports PACK_LE_APPS and driving packs (PACK_DRIVING_COLLISION_STANDARD, 
 * PACK_DRIVING_VIOLATIONS_STANDARD, PACK_DRIVING_STANDARD)
 */
function validateField(fieldName, value, incidentContext = {}) {
  const normalized = normalizeText(value).toLowerCase();
  
  console.log(`[V2-PER-FIELD] validateField START: field=${fieldName}, raw="${value}", normalized="${normalized}"`);
  
  // CRITICAL: Check isDontKnow FIRST before any field-specific logic
  const isUnknownAnswer = isDontKnow(value);
  console.log(`[V2-PER-FIELD] isDontKnow result: ${isUnknownAnswer}`);
  
  // GLOBAL RULE: Empty or "don't know/recall" answers are always incomplete
  if (!normalized || isUnknownAnswer) {
    console.log(`[V2-PER-FIELD] Validation result: INCOMPLETE (empty or unknown answer)`);
    return "incomplete";
  }
  
  switch (fieldName) {
    // === PACK_LE_APPS fields ===
    case "agency":
    case "agency_name":
    case "agency_location":
    case "position":
    case "position_held":
      // Already checked for empty/unknown above
      console.log(`[V2-PER-FIELD] Validation result: COMPLETE (${fieldName} has valid value)`);
      return "complete";
    
    case "monthYear":
    case "application_date":
    case "incident_date":
    case "employment_dates":
    case "collisionDate":
    case "violationDate":
    case "incidentDate":
      // Check for any year pattern (4 digits) or approximate terms
      const hasYear = /\b(19|20)\d{2}\b/.test(normalized);
      const hasApproximate = /(early|late|mid|around|about|spring|summer|fall|winter|beginning|end)/i.test(normalized);
      const hasMonth = /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)/i.test(normalized);
      
      if (hasYear || hasMonth || hasApproximate) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (has date indicator)`);
        return "complete";
      }
      // If they gave something but no date indicators, still accept if long enough
      if (normalized.length > 3) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (has content)`);
        return "complete";
      }
      console.log(`[V2-PER-FIELD] Validation result: INCOMPLETE (no date found)`);
      return "incomplete";
    
    case "outcome":
      // Must be one of: selected, not selected, withdrew, disqualified, still in process
      const validOutcomes = [
        "selected", "hired", "accepted", "offered",
        "not selected", "rejected", "denied", "unsuccessful", "failed",
        "withdrew", "withdrawn", "pulled out", "decided not to",
        "disqualified", "dq", "removed",
        "still in process", "pending", "waiting", "ongoing", "in progress",
        // Driving-related outcomes
        "paid", "dismissed", "reduced", "contested", "guilty", "not guilty",
        "points", "fine", "warning", "citation"
      ];
      
      const hasValidOutcome = validOutcomes.some(outcome => normalized.includes(outcome));
      if (hasValidOutcome) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (valid outcome found)`);
        return "complete";
      }
      // If they gave something specific, accept it
      if (normalized.length > 5) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (has specific content)`);
        return "complete";
      }
      console.log(`[V2-PER-FIELD] Validation result: INCOMPLETE (no valid outcome)`);
      return "incomplete";
    
    case "reason":
      // Cannot be empty or "don't remember" unless outcome is "still in process"
      const outcomeValue = normalizeText(incidentContext.outcome).toLowerCase();
      const isStillInProcess = outcomeValue.includes("still") || outcomeValue.includes("pending") || 
                               outcomeValue.includes("waiting") || outcomeValue.includes("ongoing");
      
      if (isStillInProcess) {
        // Reason is optional for ongoing processes
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (still in process, reason optional)`);
        return "complete";
      }
      console.log(`[V2-PER-FIELD] Validation result: COMPLETE (reason has value)`);
      return "complete";
    
    case "issues":
      // If "no" → complete; if "yes" → need to probe for issue type
      if (normalized === "no" || normalized.includes("no issues") || normalized.includes("none") || normalized === "n") {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (no issues)`);
        return "complete";
      }
      if (normalized === "yes" || normalized === "y") {
        // They said yes but didn't describe the issues
        console.log(`[V2-PER-FIELD] Validation result: INCOMPLETE (yes but no description)`);
        return "incomplete";
      }
      // If they gave a description, it's complete
      if (normalized.length > 10) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (has description)`);
        return "complete";
      }
      console.log(`[V2-PER-FIELD] Validation result: INCOMPLETE (no valid issues response)`);
      return "incomplete";
    
    case "stageReached":
    case "stage_reached":
      // Optional field - accept any non-empty answer
      if (normalized.length > 0) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (stageReached has value)`);
        return "complete";
      }
      // Empty is acceptable for optional field
      console.log(`[V2-PER-FIELD] Validation result: COMPLETE (optional field)`);
      return "complete";
    
    // === PACK_INTEGRITY_APPS fields ===
    case "issue_type":
    case "discovery_method":
    case "finding":
    case "allegation_type":
      // Choice fields - accept any selection
      if (normalized.length > 0) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (choice field has value)`);
        return "complete";
      }
      return "incomplete";
    
    case "what_omitted":
    case "reason_omitted":
    case "allegation_description":
      // Require substantive description
      if (normalized.length > 10) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (description has content)`);
        return "complete";
      }
      return "incomplete";
    
    case "consequences":
    case "discipline":
    case "ia_case_number":
    case "reason_not_selected":
      // Optional fields - accept any content or "none"
      if (normalized.length > 0 || ["none", "n/a", "na", "unknown"].includes(normalized)) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (optional field has value)`);
        return "complete";
      }
      return "complete"; // Optional, so empty is OK
    
    case "corrected":
    case "full_disclosure":
    case "appealed":
    case "has_documentation":
      // Boolean fields
      if (["yes", "y", "no", "n", "true", "false"].includes(normalized)) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (boolean answer)`);
        return "complete";
      }
      if (normalized.length > 0) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (has response)`);
        return "complete";
      }
      return "incomplete";
    
    // === DRIVING COLLISION fields ===
    case "collisionLocation":
    case "violationLocation":
      // Accept any location description
      if (normalized.length > 2) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (location has value)`);
        return "complete";
      }
      return "incomplete";
    
    case "collisionDescription":
    case "incidentDescription":
    case "violationType":
    case "incidentType":
      // Require some description
      if (normalized.length > 5) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (description has content)`);
        return "complete";
      }
      return "incomplete";
    
    case "atFault":
    case "injuries":
    case "propertyDamage":
    case "citations":
    case "alcoholInvolved":
      // Yes/no fields
      if (["yes", "y", "no", "n", "none", "n/a"].includes(normalized)) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (yes/no answer)`);
        return "complete";
      }
      // Accept descriptive answers too
      if (normalized.length > 3) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (has description)`);
        return "complete";
      }
      return "incomplete";
    
    case "fines":
    case "points":
      // Accept amounts, "none", or descriptions
      if (normalized.length > 0) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (fines/points has value)`);
        return "complete";
      }
      return "incomplete";
    
    default:
      // Unknown field - accept any non-empty value that's not "don't know"
      if (normalized.length > 0) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (default: has content)`);
        return "complete";
      }
      console.log(`[V2-PER-FIELD] Validation result: INCOMPLETE (default: empty)`);
      return "incomplete";
  }
}

/**
 * Get static fallback probe question for a field (used when LLM fails)
 * Supports PACK_LE_APPS and driving packs
 * 
 * For fields with multi-level probing (like collisionDate), uses the MULTI_LEVEL_PROBES config.
 */
function getStaticFallbackQuestion(fieldName, probeCount, currentValue, incidentContext = {}) {
  const isFirstProbe = probeCount === 0;
  const isSecondProbe = probeCount === 1;
  
  switch (fieldName) {
    // === PACK_LE_APPS fields ===
    case "agency":
      if (isFirstProbe) {
        return "It's important that we know which agency you applied to. Can you please provide the name of the law enforcement agency, even if you're not 100% certain of the exact name?";
      }
      return "I understand you may not remember exactly, but any information about the agency—such as the city, county, or type of department—would be helpful. What can you tell me?";
    
    case "position":
      if (isFirstProbe) {
        return "What position were you applying for at this agency? For example, was it a police officer, deputy sheriff, corrections officer, or another role?";
      }
      return "Even a general description of the role would help. Was it a sworn position, civilian role, or something else?";
    
    case "monthYear":
      if (isFirstProbe) {
        return "We need at least an approximate timeframe for this application. Can you give us an estimate, like 'around 2020' or 'early 2019'?";
      }
      return "Think about what else was happening in your life at that time. Can you estimate even the year you applied?";
    
    case "outcome":
      if (isFirstProbe) {
        return "What was the final result of your application? Were you hired, not selected, did you withdraw, or is it still pending?";
      }
      return "Please clarify: did the process end with you being hired, rejected, withdrawing your application, or are you still waiting to hear back?";
    
    case "reason":
      if (isFirstProbe) {
        return "Were you given any reason for why you were not selected? This could include failing a test, background issues, or the agency's decision.";
      }
      return "Even if you weren't given an official reason, do you have any understanding of why the process ended the way it did?";
    
    case "issues":
      if (isFirstProbe) {
        return "You indicated there were issues during this hiring process. Please describe what those issues or concerns were.";
      }
      return "Can you provide more detail about the issues that came up? For example, was it related to your background, testing, or something else?";
    
    case "stageReached":
      if (isFirstProbe) {
        return "How far did you get in the hiring process before it ended? Did you complete the written test, physical test, interview, background investigation, polygraph, or psychological evaluation?";
      }
      return "What was the last step you completed in their process?";
    
    // === DRIVING COLLISION fields ===
    // collisionDate uses smart multi-level probing
    case "collisionDate":
      if (isFirstProbe) {
        return "I understand you don't recall the exact date. Even if you're not sure of the month, what's the closest you can get to the year? For example, was it closer to 2010, 2015, 2020, or another timeframe?";
      }
      if (isSecondProbe) {
        return "Think about what was going on in your life at the time of this collision—where you were living, what job you had, or any major life events happening then. Does that help you narrow down an approximate year or season?";
      }
      return "If you still can't pinpoint a specific year, that's okay. Please give your best estimate as a range, like 'sometime between 2010 and 2015' or 'early 2020s'. Any approximate timeframe will help.";
    
    case "collisionLocation":
      if (isFirstProbe) {
        return "Where did this collision take place? Please describe the location, such as the city, street, or general area.";
      }
      return "Can you provide any details about where this collision occurred?";
    
    case "collisionDescription":
      if (isFirstProbe) {
        return "Please describe what happened in this collision. How did the accident occur?";
      }
      return "Can you provide more details about how this collision happened?";
    
    case "atFault":
      if (isFirstProbe) {
        return "Were you determined to be at fault for this collision, either fully or partially?";
      }
      return "Was any fault assigned to you in this collision?";
    
    case "injuries":
      if (isFirstProbe) {
        return "You mentioned you're not sure about injuries. Think back to the collision: did anyone complain of pain, soreness, or stiffness afterward — including you, your passengers, or people in the other vehicle?";
      }
      if (isSecondProbe) {
        return "To the best of your memory, did anyone see a doctor, go to the hospital, or miss work or school because of this collision? If so, who was it — you, a passenger, or someone in the other vehicle?";
      }
      return "Even if you can't remember exact details, give your best estimate of how serious any injuries were — for example, 'minor soreness only', 'possible whiplash', or 'someone went to the ER'.";
    
    case "propertyDamage":
      if (isFirstProbe) {
        return "Was there property damage as a result of this collision? Please describe the damage to vehicles or other property.";
      }
      return "What property was damaged in this collision?";
    
    case "citations":
      if (isFirstProbe) {
        return "Were any citations or tickets issued as a result of this collision?";
      }
      return "Did you receive any traffic citations from this incident?";
    
    case "alcoholInvolved":
      if (isFirstProbe) {
        return "Was alcohol or any other substance involved in this collision?";
      }
      return "Were you or any other party under the influence during this collision?";
    
    // === DRIVING VIOLATIONS fields ===
    case "violationDate":
      if (isFirstProbe) {
        return "When did this violation occur? Please provide at least the month and year.";
      }
      return "Can you estimate when this violation happened?";
    
    case "violationType":
      if (isFirstProbe) {
        return "What type of violation was this? For example, speeding, running a red light, improper lane change, etc.";
      }
      return "Can you describe what you were cited for?";
    
    case "violationLocation":
      if (isFirstProbe) {
        return "Where did this violation occur? Please describe the location.";
      }
      return "Can you provide the location of this traffic stop?";
    
    case "fines":
      if (isFirstProbe) {
        return "Were there any fines associated with this violation? If so, how much?";
      }
      return "What was the fine amount for this violation?";
    
    case "points":
      if (isFirstProbe) {
        return "Were any points added to your driving record as a result of this violation?";
      }
      return "How many points, if any, were assessed?";
    
    // === GENERAL DRIVING fields ===
    case "incidentDate":
      if (isFirstProbe) {
        return "When did this incident occur? Please provide at least the month and year.";
      }
      return "Can you estimate when this happened?";
    
    case "incidentType":
      if (isFirstProbe) {
        return "What type of driving incident was this?";
      }
      return "Can you describe what type of incident this was?";
    
    case "incidentDescription":
      if (isFirstProbe) {
        return "Please describe what happened in this incident.";
      }
      return "Can you provide more details about this incident?";
    
    // === PACK_INTEGRITY_APPS fields ===
    case "issue_type":
      if (isFirstProbe) {
        return "What type of integrity issue was this — an omission, falsification, incomplete answer, or something else?";
      }
      return "Can you clarify what category this issue falls under?";
    
    case "what_omitted":
      if (isFirstProbe) {
        return "Can you describe what specific information was incomplete or inaccurate on the application?";
      }
      return "Please provide more detail about what was left out or misrepresented.";
    
    case "reason_omitted":
      if (isFirstProbe) {
        return "What led you to leave that information off or answer it the way you did?";
      }
      return "Can you help me understand the circumstances that led to this?";
    
    case "consequences":
      if (isFirstProbe) {
        return "What consequences or disciplinary action resulted from this issue?";
      }
      return "Was there any formal action taken as a result?";
    
    case "corrected":
      if (isFirstProbe) {
        return "Has this issue been addressed or corrected since then?";
      }
      return "Have you since disclosed this information on other applications?";
    
    // === PACK_LE_MISCONDUCT_STANDARD fields ===
    case "position_held":
      if (isFirstProbe) {
        return "What was your position or rank at that agency when this occurred?";
      }
      return "Can you describe your role at the department?";
    
    case "employment_dates":
      if (isFirstProbe) {
        return "When were you employed at this agency? Please provide approximate years.";
      }
      return "Can you estimate the years you worked there?";
    
    case "allegation_type":
      if (isFirstProbe) {
        return "What type of allegation or concern was this — for example, policy violation, use of force, honesty issue, or something else?";
      }
      return "Can you clarify what category this allegation falls under?";
    
    case "allegation_description":
      if (isFirstProbe) {
        return "Can you describe what was alleged?";
      }
      return "Please provide more detail about the nature of the allegation.";
    
    case "ia_case_number":
      if (isFirstProbe) {
        return "Do you recall an Internal Affairs case number or reference for this incident?";
      }
      return "Is there any case number or tracking reference you remember?";
    
    case "finding":
      if (isFirstProbe) {
        return "What was the official finding — sustained, not sustained, exonerated, unfounded, or something else?";
      }
      return "What was the outcome of the investigation?";
    
    case "discipline":
      if (isFirstProbe) {
        return "What discipline, if any, resulted from this incident?";
      }
      return "Was any formal disciplinary action taken?";
    
    case "appealed":
      if (isFirstProbe) {
        return "Did you appeal or contest the outcome of this investigation?";
      }
      return "Was there any appeal or grievance process?";
    
    // === PACK_WORKPLACE_STANDARD fields ===
    case "employer":
      if (isFirstProbe) {
        return "What company or organization were you working for when this incident occurred?";
      }
      return "Can you provide the employer's name?";
    
    case "position_at_time":
      if (isFirstProbe) {
        return "What was your job title or position when this happened?";
      }
      return "Can you describe your role at the time?";
    
    case "misconduct_type":
      if (isFirstProbe) {
        return "What type of issue was this — for example, a policy violation, dishonesty, conflict, or something else?";
      }
      return "Can you clarify what category this issue falls under?";
    
    case "incident_description":
      if (isFirstProbe) {
        return "Can you describe what happened in this incident?";
      }
      return "Please provide more details about what occurred.";
    
    case "corrective_action":
      if (isFirstProbe) {
        return "What action did your employer take — for example, a warning, suspension, or termination?";
      }
      return "Was there any formal action taken by the employer?";
    
    case "separation_type":
      if (isFirstProbe) {
        return "How did your employment end at this job — did you leave voluntarily, resign under pressure, or were you terminated?";
      }
      return "Can you clarify whether you left voluntarily or were asked to leave?";
    
    case "official_reason":
      if (isFirstProbe) {
        return "What reason did the employer give for any disciplinary action or separation?";
      }
      return "Was there an official reason communicated to you?";
    
    case "isolated_or_recurring":
      if (isFirstProbe) {
        return "Was this a one-time incident or part of a recurring pattern?";
      }
      return "Did this happen more than once?";
    
    case "impact":
      if (isFirstProbe) {
        return "What impact, if any, did this have on the workplace or your colleagues?";
      }
      return "Were there any consequences to the workplace?";
    
    case "remediation":
      if (isFirstProbe) {
        return "What steps have you taken since this incident to address or prevent similar issues?";
      }
      return "Have you made any changes since then?";
    
    default:
      return `Can you provide more details about ${fieldName}?`;
  }
}

/**
 * Field labels for human-readable prompts
 * Supports PACK_LE_APPS, PACK_INTEGRITY_APPS, PACK_LE_MISCONDUCT_STANDARD, and driving packs
 */
const FIELD_LABELS = {
  // PACK_LE_APPS
  "agency": "Agency / Department",
  "agency_name": "Agency / Department Name",
  "agency_location": "Agency Location",
  "position": "Position Applied For",
  "monthYear": "Application Date (month/year)",
  "application_date": "Application Date (month/year)",
  "outcome": "Outcome",
  "reason": "Reason for Non-Selection",
  "reason_not_selected": "Reason for Non-Selection",
  "issues": "Issues or Concerns",
  "stageReached": "Stage Reached in Hiring Process",
  "stage_reached": "Stage Reached in Hiring Process",
  "full_disclosure": "Full Disclosure on Application",
  "has_documentation": "Documentation Available",
  
  // PACK_INTEGRITY_APPS
  "incident_date": "Incident Date (month/year)",
  "issue_type": "Type of Issue",
  "what_omitted": "What Was Omitted/Falsified",
  "reason_omitted": "Why It Was Omitted",
  "discovery_method": "How Discovered",
  "consequences": "Consequences",
  "corrected": "Has Been Corrected",
  
  // PACK_LE_MISCONDUCT_STANDARD
  "position_held": "Position Held",
  "employment_dates": "Employment Dates",
  "allegation_type": "Nature of Allegation",
  "allegation_description": "Description of Allegation",
  "ia_case_number": "IA Case Number",
  "finding": "Finding / Outcome",
  "discipline": "Disciplinary Action",
  "appealed": "Was Appealed",
  
  // DRIVING COLLISION
  "collisionDate": "Collision Date (month/year)",
  "collisionLocation": "Collision Location",
  "collisionDescription": "Description of Collision",
  "atFault": "At Fault",
  "injuries": "Injuries",
  "propertyDamage": "Property Damage",
  "citations": "Citations Issued",
  "alcoholInvolved": "Alcohol/Substances Involved",
  
  // DRIVING VIOLATIONS
  "violationDate": "Violation Date (month/year)",
  "violationType": "Type of Violation",
  "violationLocation": "Violation Location",
  "fines": "Fines",
  "points": "Points on License",
  
  // GENERAL DRIVING
  "incidentDate": "Incident Date (month/year)",
  "incidentType": "Type of Incident",
  "incidentDescription": "Description of Incident",
  
  // PACK_WORKPLACE_STANDARD
  "employer": "Employer",
  "position_at_time": "Position at Time of Incident",
  "misconduct_type": "Type of Misconduct",
  "incident_description": "Description of Incident",
  "corrective_action": "Corrective Action Taken",
  "separation_type": "Separation Type",
  "official_reason": "Official Reason Given",
  "isolated_or_recurring": "Isolated or Recurring",
  "impact": "Impact on Workplace",
  "remediation": "Corrective Steps / Remediation",
  
  // PACK_INTEGRITY_APPS
  "position_applied_for": "Position Applied For",
  "issue_type": "Integrity Issue Type",
  "what_omitted": "Information Involved",
  "reason_omitted": "Reason for Omission",
  "consequences": "Application Outcome",
  "corrected": "Corrected Disclosure",
  "remediation_steps": "Remediation Steps",
  
  // PACK_LE_APPS
  "agency_location": "Agency Location",
  "background_issues": "Background Issues Cited",
  
  // PACK_LE_MISCONDUCT_STANDARD
  "allegation_description": "Allegation Description",
  
  // PACK_FINANCIAL_STANDARD
  "financial_issue_type": "Type of Financial Issue",
  "most_recent_date": "Most Recent Occurrence",
  "amount_owed": "Amount Owed / Affected",
  "creditor": "Creditor or Agency Involved",
  "legal_actions": "Legal Actions Taken",
  "employment_impact": "Impact on Employment / Licensing",
  "resolution_steps": "Steps Taken to Resolve",
  "resolution_status": "Resolution Status",
  "remaining_obligations": "Outstanding Obligations",
  
  // PACK_GANG_STANDARD
  "gang_name": "Gang or Group",
  "end_date": "End of Involvement",
  "involvement_level": "Level of Involvement",
  "origin_story": "How Involvement Began",
  "activities": "Activities or Participation",
  "illegal_activity": "Illegal Activity Involved",
  "post_exit_contact": "Contact After Leaving Group",
  
  // PACK_MILITARY_STANDARD
  "branch": "Branch of Service",
  "rank_role": "Rank and Role",
  "orders_violation": "Orders/Standards Involved",
  "alcohol_drugs": "Alcohol/Drug/Stress Factors",
  "disciplinary_action": "Disciplinary Action Taken",
  "career_impact": "Impact on Career or Clearance",
  "remediation_steps": "Steps Taken Since Incident",
  
  // PACK_WEAPONS_STANDARD
  "weapon_type": "Type of Weapon",
  "weapon_ownership": "Ownership / Possession",
  "weapon_use": "Carrying / Displaying / Using Weapon",
  "threats": "Threats or Danger to Others",
  "discharge": "Weapon Discharge",
  "actions_taken": "Actions Taken Afterward",
  
  // PACK_SEX_ADULT_STANDARD
  "type": "Type of Misconduct",
  "when": "When It Occurred",
  "where": "Location",
  "consensual": "Consent Status",
  "environment": "Setting",
  "authority_awareness": "Authority Awareness",
  "consequences": "Consequences & Remediation",
  
  // PACK_NON_CONSENT_STANDARD
  "incident_type": "Type of Incident",
  "date": "Date of Incident",
  "other_party": "Other Party (Relationship Only)",
  "narrative": "What Happened",
  "coercion": "Coercion or Force",
  "consent_signals": "Consent Signals",
  "injuries": "Injuries Reported",
  "legal_action": "Official Actions",
  
  // PACK_DRUG_SALE_STANDARD
  "substance_type": "Substance Type",
  "role": "Role / Involvement",
  "approx_date": "Approximate Date",
  "frequency": "Frequency",
  "location": "Location",
  "associates": "Other Parties",
  "compensation": "Profit / Compensation",
  "weapons_violence": "Weapons or Violence",
  "law_enforcement_involved": "LE Involvement",
  "arrested_charged": "Arrest / Charges",
  "disclosed_prior": "Previously Disclosed",
  "recurrence": "Occurred Again",
  "prevention_steps": "Steps Taken Since",
  
  // PACK_DRUG_USE_STANDARD
  "first_use_date": "First Use",
  "last_use_date": "Most Recent Use",
  "total_uses": "Times Used",
  "use_context": "Context of Use",
  "use_location": "Location",
  "obtain_method": "Obtained How",
  "under_influence_in_prohibited_setting": "Under Influence in Prohibited Setting",
  "consequences": "Consequences",
  "prior_disclosure": "Previously Disclosed",
  "other_substances_used": "Other Substances",
  "behavior_stopped": "Behavior Stopped",
  "mitigation_steps": "Mitigation Steps"
};

/**
 * Generate a probe question for a specific incomplete field using LLM
 * Falls back to static question if LLM fails
 * NOW USES: GlobalSettings AI runtime config (model, temperature, max_tokens, top_p)
 */
async function generateFieldProbeQuestion(base44Client, {
  fieldName,
  currentValue,
  probeCount,
  incidentContext = {},
  packId,
  maxProbesPerField
}) {
  console.log(`[V2-PER-FIELD] Generating probe for ${fieldName} (probe #${probeCount + 1})`);
  
  const fieldLabel = FIELD_LABELS[fieldName] || fieldName;
  
  try {
    // Build unified instructions from GlobalSettings + FollowUpPack
    const { instructions, aiConfig } = await buildFieldProbeInstructions(
      base44Client,
      packId,
      fieldName,
      fieldLabel,
      maxProbesPerField
    );
    
    // Build user prompt with context
    const userPrompt = `The candidate was asked about: "${fieldLabel}"
Their answer was: "${currentValue || '(no answer provided)'}"

This is probe attempt #${probeCount + 1} of ${maxProbesPerField} allowed for this field.

Context from other fields in this incident:
${Object.entries(incidentContext)
  .filter(([k, v]) => v && k !== fieldName)
  .map(([k, v]) => `- ${FIELD_LABELS[k] || k}: ${v}`)
  .join('\n') || '(no other fields answered yet)'}

Generate ONE specific follow-up question to get a clearer answer for the "${fieldLabel}" field.`;

    // EXPLICIT LOGGING: About to call LLM
    console.log(`[V2-LLM] Calling InvokeLLM for pack=${packId}, field=${fieldName}, probeCount=${probeCount}`);
    console.log(`[V2-LLM] AI Config: model=${aiConfig.model}, temp=${aiConfig.temperature}, max_tokens=${aiConfig.max_tokens}`);
    
    // Call InvokeLLM with unified instructions AND AI runtime config
    const result = await base44Client.integrations.Core.InvokeLLM({
      prompt: `${instructions}\n\n${userPrompt}`,
      add_context_from_internet: false,
      model: aiConfig.model,
      temperature: aiConfig.temperature,
      max_tokens: aiConfig.max_tokens,
      top_p: aiConfig.top_p
    });
    
    const question = result?.trim();
    
    if (question && question.length >= 10 && question.length <= 500) {
      // EXPLICIT LOGGING: LLM success
      console.log(`[V2-LLM] Probe question generated by LLM for pack=${packId}, field=${fieldName}`);
      console.log(`[V2-LLM] Question: "${question.substring(0, 80)}..."`);
      return { question, isFallback: false, source: 'llm', model: aiConfig.model };
    } else {
      // EXPLICIT LOGGING: LLM returned invalid output
      console.warn(`[V2-LLM] Invalid or empty LLM probe output for pack=${packId}, field=${fieldName} - using fallback`);
      console.warn(`[V2-LLM] Raw output was: "${result}"`);
      const fallback = getStaticFallbackQuestion(fieldName, probeCount, currentValue, incidentContext);
      return { question: fallback, isFallback: true, source: 'fallback_invalid_llm' };
    }
    
  } catch (err) {
    // EXPLICIT LOGGING: LLM error
    console.error(`[V2-LLM] Error from InvokeLLM for pack=${packId}, field=${fieldName} - falling back to static probe`);
    console.error(`[V2-LLM] Error details:`, err.message);
    const fallback = getStaticFallbackQuestion(fieldName, probeCount, currentValue, incidentContext);
    return { question: fallback, isFallback: true, source: 'fallback_error', error: err.message };
  }
}

/**
 * Map raw field key to semantic field name
 */
function mapFieldKey(packConfig, rawFieldKey) {
  return packConfig.fieldKeyMap[rawFieldKey] || rawFieldKey;
}

/**
 * Semantic types that are considered "date" fields for no-recall forcing
 */
const DATE_SEMANTIC_TYPES = new Set([
  'monthYear', 'collisionDate', 'violationDate', 'incidentDate',
  'date', 'incident_date', 'applicationDate'
]);

/**
 * Check if a semantic field is a required date field for the pack
 */
function isRequiredDateField(packConfig, semanticField) {
  if (!packConfig) return false;
  const isDateType = DATE_SEMANTIC_TYPES.has(semanticField);
  const isRequired = packConfig.requiredFields?.includes(semanticField);
  return isDateType && isRequired;
}

/**
 * Main probe engine function - Per-Field Mode
 * NOW USES: GlobalSettings + FollowUpPack.ai_probe_instructions via InvokeLLM
 */
async function probeEngineV2(input, base44Client) {
  const {
    pack_id,
    field_key,                    // The specific field being validated
    field_value,                  // The value provided for this field
    previous_probes_count = 0,    // How many times we've probed this field
    incident_context = {},        // Other field values for context
    mode: requestMode = "VALIDATE_FIELD",  // VALIDATE_FIELD or LEGACY
    answerLooksLikeNoRecall: frontendNoRecallFlag = false  // Frontend hint
  } = input;

  console.log(`[V2-PER-FIELD] Starting validation for pack=${pack_id}, field=${field_key}, value="${field_value}", probes=${previous_probes_count}, mode=${requestMode}, frontendNoRecall=${frontendNoRecallFlag}`);

  const packConfig = PACK_CONFIG[pack_id];
  
  // DETERMINISTIC RULE: Force probe for required date fields with no-recall answers
  // This runs BEFORE LLM to guarantee probing when frontend flags no-recall
  if (packConfig) {
    const semanticFieldEarly = mapFieldKey(packConfig, field_key);
    const isReqDate = isRequiredDateField(packConfig, semanticFieldEarly);
    const backendNoRecall = answerLooksLikeNoRecall(field_value);
    
    if (isReqDate && (frontendNoRecallFlag || backendNoRecall)) {
      console.log(`[V2-PER-FIELD] Backend forced QUESTION due to no-recall on required date field`, {
        pack_id,
        field_key,
        semanticField: semanticFieldEarly,
        frontendNoRecallFlag,
        backendNoRecall
      });
      
      return {
        mode: "QUESTION",
        pack_id,
        field_key,
        semanticField: semanticFieldEarly,
        question: "About what month and year did this incident occur?",
        validationResult: "incomplete",
        previousProbeCount: previous_probes_count,
        maxProbesPerField: 3,
        isFallback: false,
        probeSource: 'deterministic_no_recall_date',
        reasoning: 'Required date field answered with no-recall phrase',
        message: `Forced probe for required date field ${semanticFieldEarly}`
      };
    }
  }
  
  if (!packConfig) {
    console.log(`[V2-PER-FIELD] No pack config found for ${pack_id} - using generic validation`);
    
    // For unsupported packs, still apply global semantic rules
    const semanticInfo = semanticV2EvaluateAnswer(field_key, field_value, incident_context);
    
    // If the answer looks like "no recall", trigger a generic probe
    if (semanticInfo.status === "needs_probe") {
      const genericProbe = `You mentioned "${field_value || '(no answer)'}". Could you please provide a more specific answer?`;
      return {
        mode: "QUESTION",
        pack_id,
        field_key,
        semanticField: field_key,
        question: genericProbe,
        validationResult: "incomplete",
        previousProbeCount: previous_probes_count,
        maxProbesPerField: 3,
        isFallback: true,
        probeSource: 'generic_unsupported_pack',
        semanticInfo,
        message: `Generic probe for unsupported pack ${pack_id}`
      };
    }
    
    // If answer seems valid, just proceed
    return { 
      mode: "NEXT_FIELD", 
      pack_id,
      field_key,
      semanticField: field_key,
      validationResult: "complete",
      semanticInfo,
      message: `Unsupported pack ${pack_id} - accepting answer` 
    };
  }

  // Map raw field key to semantic name
  const semanticField = mapFieldKey(packConfig, field_key);
  console.log(`[V2-PER-FIELD] Mapped ${field_key} → ${semanticField}`);

  // Global v2-semantic evaluation (pack-agnostic)
  const semanticInfo = semanticV2EvaluateAnswer(semanticField, field_value, incident_context);

  // Fetch max_ai_followups from FollowUpPack entity
  let maxProbesPerField = DEFAULT_MAX_PROBES_FALLBACK;
  
  try {
    const followUpPacks = await base44Client.entities.FollowUpPack.filter({
      followup_pack_id: pack_id,
      active: true
    });
    if (followUpPacks.length > 0) {
      const packEntity = followUpPacks[0];
      
      if (typeof packEntity.max_ai_followups === 'number' && packEntity.max_ai_followups > 0) {
        maxProbesPerField = packEntity.max_ai_followups;
        console.log(`[V2-PER-FIELD] Using max_ai_followups from FollowUpPack entity: ${maxProbesPerField}`);
      } else {
        console.log(`[V2-PER-FIELD] FollowUpPack entity has no valid max_ai_followups, using fallback: ${maxProbesPerField}`);
      }
    } else {
      console.log(`[V2-PER-FIELD] No active FollowUpPack entity found for ${pack_id}, using fallback: ${maxProbesPerField}`);
    }
  } catch (err) {
    console.warn(`[V2-PER-FIELD] Error fetching FollowUpPack entity, using fallback: ${maxProbesPerField}`, err.message);
  }

  // Validate the current field value with pack-specific rules
  let validationResult = validateField(semanticField, field_value, incident_context);
  console.log(`[V2-PER-FIELD] Validation result for ${semanticField}: ${validationResult}, value="${field_value}"`);

  // v2-Semantic override:
  // If semantic layer says "needs_probe" (e.g., NO_RECALL / EMPTY),
  // and field-specific rules thought it was complete, we force probing.
  if (semanticInfo.status === "needs_probe" && validationResult === "complete") {
    console.log(`[V2-SEMANTIC] Override: semantic layer requires probing (${semanticInfo.reason}) - forcing validationResult="incomplete"`);
    validationResult = "incomplete";
  }

  // Check max probes FIRST - if we've already probed enough, stop probing
  if (previous_probes_count >= maxProbesPerField) {
    console.log(`[V2-PER-FIELD] Max probes (${maxProbesPerField}) reached for ${semanticField} → accepting and advancing`);
    return {
      mode: "NEXT_FIELD",
      pack_id,
      field_key,
      semanticField,
      validationResult: "max_probes_reached",
      previousProbeCount: previous_probes_count,
      maxProbesPerField,
      semanticInfo,
      message: `Max probes reached for ${semanticField}, accepting current value`
    };
  }

  // If field is complete (valid answer), move to next field
  if (validationResult === "complete") {
    console.log(`[V2-PER-FIELD] Field ${semanticField} is complete → advancing`);
    return {
      mode: "NEXT_FIELD",
      pack_id,
      field_key,
      semanticField,
      validationResult: "complete",
      previousProbeCount: previous_probes_count,
      maxProbesPerField,
      semanticInfo,
      message: `Field ${semanticField} validated successfully`
    };
  }

  // Field is incomplete - generate probe question using LLM (with static fallback)
  const probeResult = await generateFieldProbeQuestion(base44Client, {
    fieldName: semanticField,
    currentValue: field_value,
    probeCount: previous_probes_count,
    incidentContext: incident_context,
    packId: pack_id,
    maxProbesPerField
  });
  
  console.log(`[V2-PER-FIELD] Field ${semanticField} incomplete → returning QUESTION mode (source: ${probeResult.source})`);
  console.log(`[V2-PER-FIELD] Question: "${probeResult.question.substring(0, 80)}..."`);

  return {
    mode: "QUESTION",
    pack_id,
    field_key,
    semanticField,
    question: probeResult.question,
    validationResult: "incomplete",
    previousProbeCount: previous_probes_count,
    maxProbesPerField,
    isFallback: probeResult.isFallback,
    probeSource: probeResult.source,
    semanticInfo,
    message: `Probing for more information about ${semanticField}`
  };
}

/**
 * Deno serve handler
 */
Deno.serve(async (req) => {
  // Extract packId and fieldKey early so they're available in catch blocks
  let packId = null;
  let fieldKey = null;
  
  try {
    const base44 = createClientFromRequest(req);
    
    // Auth check with graceful failure
    let user;
    let probeCount = 0;
    try {
      user = await base44.auth.me();
    } catch (authError) {
      console.error('[V2-PER-FIELD][BACKEND-ERROR]', { fieldKey, packId, error: authError.message });
      
      // Try to parse input for fallback even if auth fails
      try {
        const bodyText = await req.text();
        const parsed = JSON.parse(bodyText);
        packId = parsed.pack_id;
        fieldKey = parsed.field_key;
        probeCount = parsed.previous_probes_count || 0;
      } catch (e) {
        // Ignore parse errors here
      }
      
      const packConfig = PACK_CONFIG[packId];
      const semanticField = packConfig ? mapFieldKey(packConfig, fieldKey) : null;
      const fallback = buildFallbackProbeForField({ packId, fieldKey, semanticField, probeCount });
      if (fallback) {
        console.log('[V2-PER-FIELD] Auth error → using deterministic fallback probe for field', { packId, fieldKey, probeCount });
        return Response.json({
          mode: fallback.mode,
          question: fallback.question,
          packId,
          fieldKey,
          isFallback: true,
        }, { status: 200 });
      }
      
      return Response.json({ 
        mode: "NONE",
        reason: "BACKEND_ERROR",
        details: authError.message || "Authentication failed"
      }, { status: 200 });
    }
    
    if (!user) {
      console.error('[V2-PER-FIELD][BACKEND-ERROR]', { fieldKey, packId, error: "User not authenticated" });
      
      const packConfig = PACK_CONFIG[packId];
      const semanticField = packConfig ? mapFieldKey(packConfig, fieldKey) : null;
      const fallback = buildFallbackProbeForField({ packId, fieldKey, semanticField, probeCount });
      if (fallback) {
        console.log('[V2-PER-FIELD] No user → using deterministic fallback probe for field', { packId, fieldKey, probeCount });
        return Response.json({
          mode: fallback.mode,
          question: fallback.question,
          packId,
          fieldKey,
          isFallback: true,
        }, { status: 200 });
      }
      
      return Response.json({ 
        mode: "NONE",
        reason: "BACKEND_ERROR",
        details: "User not authenticated"
      }, { status: 200 });
    }
    
    let input;
    try {
      input = await req.json();
      packId = input.pack_id;
      fieldKey = input.field_key;
    } catch (parseError) {
      console.error('[V2-PER-FIELD][BACKEND-ERROR]', { fieldKey, packId, error: parseError.message });
      return Response.json({ 
        mode: "NONE",
        reason: "BACKEND_ERROR",
        details: parseError.message || "Invalid request body"
      }, { status: 200 });
    }
    
    console.log('[PROBE_ENGINE_V2] Request received:', JSON.stringify(input));
    
    const result = await probeEngineV2(input, base44);
    console.log('[PROBE_ENGINE_V2] Response:', JSON.stringify(result));
    
    return Response.json(result);
  } catch (error) {
    // CRITICAL: Return 200 with structured response, NOT 500 or mode="ERROR"
    // This allows frontend to treat it as "no probe available"
    console.error('[V2-PER-FIELD][BACKEND-ERROR]', { fieldKey, packId, error: error.message });
    
    // Try to get probeCount from request for multi-level fallback
    let probeCount = 0;
    try {
      // Note: req.json() might have already been consumed, so this is best-effort
      probeCount = 0; // Default to first probe level
    } catch (e) {}
    
    // Try fallback probe for this field
    const packConfig = PACK_CONFIG[packId];
    const semanticField = packConfig ? mapFieldKey(packConfig, fieldKey) : null;
    const fallback = buildFallbackProbeForField({ packId, fieldKey, semanticField, probeCount });
    if (fallback) {
      console.log('[V2-PER-FIELD] Unhandled error → using deterministic fallback probe for field', { packId, fieldKey, probeCount });
      return Response.json({
        mode: fallback.mode,
        question: fallback.question,
        packId,
        fieldKey,
        isFallback: true,
      }, { status: 200 });
    }
    
    return Response.json({ 
      mode: "NONE",
      reason: "BACKEND_ERROR",
      details: error.message || "Unexpected error during probing."
    }, { status: 200 });
  }
});