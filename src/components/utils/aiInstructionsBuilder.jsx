import { base44 } from "@/api/base44Client";

/**
 * Build AI instruction blocks by combining global, section, and pack instructions
 * 
 * @param {Object} options
 * @param {string} options.mode - One of: "probe", "section-summary", "report"
 * @param {string} [options.sectionId] - Optional section ID for section-specific instructions
 * @param {string} [options.packId] - Optional pack ID for pack-specific instructions
 * @param {number} [options.max_ai_followups] - Optional max AI follow-ups for probing mode
 * @returns {Promise<string>} Combined AI instructions
 */
export async function buildAiInstructions({ mode, sectionId, packId, max_ai_followups }) {
  try {
    // Core system rules (CJIS-aligned, safety, etc.)
    const coreRules = `You are an AI assistant for law enforcement background investigations.
You must maintain strict confidentiality and follow CJIS compliance standards.
All information must be handled with appropriate security and discretion.
Focus on factual, objective analysis without bias.`;

    let instructions = coreRules;

    // Load global settings
    const globalSettings = await base44.asServiceRole.entities.GlobalSettings.filter({ settings_id: 'global' });
    const settings = globalSettings.length > 0 ? globalSettings[0] : null;

    if (mode === "probe") {
      // Mode: AI Probing
      // Layer: Global default probing instructions
      if (settings?.ai_default_probing_instructions) {
        instructions += "\n\n" + settings.ai_default_probing_instructions;
      }

      // Layer: Section-specific guidance (if section provided)
      if (sectionId) {
        try {
          const sections = await base44.asServiceRole.entities.Section.filter({ section_id: sectionId });
          if (sections.length > 0 && sections[0].ai_section_summary_instructions) {
            instructions += "\n\n## Section Context:\n" + sections[0].ai_section_summary_instructions;
          }
        } catch (err) {
          console.error('Error loading section for probing:', err);
        }
      }

      // Layer: Pack-specific probing instructions
      if (packId) {
        try {
          const packs = await base44.asServiceRole.entities.FollowUpPack.filter({ followup_pack_id: packId });
          if (packs.length > 0 && packs[0].ai_probe_instructions) {
            instructions += "\n\n## Topic-Specific Instructions:\n" + packs[0].ai_probe_instructions;
          }
        } catch (err) {
          console.error('Error loading pack for probing:', err);
        }
      }

      // Layer: Probing limits (dynamic based on pack config or default)
      const maxFollowups = (typeof max_ai_followups === 'number' && max_ai_followups > 0) ? max_ai_followups : 3;
      instructions += "\n\n## Probing Limits:\n";
      instructions += "- Ask follow-up questions ONE at a time.\n";
      instructions += "- Your goal is to fully understand and clarify the story in about 3 follow-up questions.\n";
      instructions += `- You may ask up to ${maxFollowups} follow-up questions if needed, but stop sooner if the story is clear.\n`;
      instructions += `- Do NOT exceed ${maxFollowups} probing questions under any circumstances.`;

    } else if (mode === "section-summary") {
      // Mode: Section Summary
      // Layer: Global report instructions (for investigative lens)
      if (settings?.ai_report_instructions) {
        instructions += "\n\n" + settings.ai_report_instructions;
      }

      // Layer: Section-specific or default section summary instructions
      if (sectionId) {
        try {
          const sections = await base44.asServiceRole.entities.Section.filter({ section_id: sectionId });
          if (sections.length > 0 && sections[0].ai_section_summary_instructions) {
            instructions += "\n\n## Section Summary Guidelines:\n" + sections[0].ai_section_summary_instructions;
          } else if (settings?.ai_default_section_summary_instructions) {
            instructions += "\n\n## Section Summary Guidelines:\n" + settings.ai_default_section_summary_instructions;
          }
        } catch (err) {
          console.error('Error loading section for summary:', err);
          if (settings?.ai_default_section_summary_instructions) {
            instructions += "\n\n## Section Summary Guidelines:\n" + settings.ai_default_section_summary_instructions;
          }
        }
      } else if (settings?.ai_default_section_summary_instructions) {
        instructions += "\n\n## Section Summary Guidelines:\n" + settings.ai_default_section_summary_instructions;
      }

    } else if (mode === "report") {
      // Mode: Overall Report
      // Layer: Global report instructions
      if (settings?.ai_report_instructions) {
        instructions += "\n\n" + settings.ai_report_instructions;
      }
    }

    return instructions;

  } catch (err) {
    console.error('Error building AI instructions:', err);
    // Fallback to core rules only
    return `You are an AI assistant for law enforcement background investigations.
You must maintain strict confidentiality and follow CJIS compliance standards.
All information must be handled with appropriate security and discretion.
Focus on factual, objective analysis without bias.`;
  }
}