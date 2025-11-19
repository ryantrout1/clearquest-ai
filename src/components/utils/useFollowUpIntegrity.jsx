import { useMemo } from 'react';

/**
 * Shared hook for computing integrity analysis between Interview Questions and Follow-Up Packs
 * Used by both InterviewStructureManager and FollowupPackManager
 */
export function useFollowUpIntegrity(questions = [], packs = [], followUpQuestions = []) {
  return useMemo(() => {
    // Build pack lookup map
    const packMap = new Map();
    packs.forEach(pack => {
      packMap.set(pack.followup_pack_id, pack);
      // Handle alias for ILLEGAL_DRUG_USE
      if (pack.followup_pack_id === 'ILLEGAL_DRUG_USE') {
        packMap.set('ILLEGAL_DRUG_USE', pack);
      }
    });

    // Count deterministic questions per pack
    const packDeterministicCounts = new Map();
    const packActiveDeterministicCounts = new Map();
    followUpQuestions.forEach(q => {
      const total = packDeterministicCounts.get(q.followup_pack_id) || 0;
      packDeterministicCounts.set(q.followup_pack_id, total + 1);
      
      if (q.active !== false) {
        const active = packActiveDeterministicCounts.get(q.followup_pack_id) || 0;
        packActiveDeterministicCounts.set(q.followup_pack_id, active + 1);
      }
    });

    // Count usage per pack (which questions reference it)
    const packUsageCounts = new Map();
    const packUsageQuestions = new Map();
    
    questions.forEach(q => {
      const packId = q.followup_pack || q.followup_pack_id;
      if (packId) {
        const count = packUsageCounts.get(packId) || 0;
        packUsageCounts.set(packId, count + 1);
        
        if (!packUsageQuestions.has(packId)) {
          packUsageQuestions.set(packId, []);
        }
        packUsageQuestions.get(packId).push({
          questionId: q.id,
          questionCode: q.question_id,
          questionText: q.question_text,
          section: q.category || q.section_id,
          active: q.active
        });
      }
    });

    // Analyze each question
    const questionAnalysis = questions.map(q => {
      const packId = q.followup_pack || q.followup_pack_id;
      const hasFollowUpPack = !!packId;
      const followUpPackExists = hasFollowUpPack && packMap.has(packId);
      const pack = followUpPackExists ? packMap.get(packId) : null;
      const deterministicCount = pack ? (packDeterministicCounts.get(pack.followup_pack_id) || 0) : 0;
      
      return {
        question: q,
        hasFollowUpPack,
        followUpPackExists,
        followUpPackIdOrCode: packId,
        followUpPackName: pack?.pack_name,
        followUpPackDeterministicCount: deterministicCount,
        followUpPackHasDeterministic: deterministicCount > 0,
        followUpPackHasAIInstructions: pack?.ai_probe_instructions ? true : false
      };
    });

    // Analyze each pack
    const packAnalysis = packs.map(pack => {
      const deterministicCount = packDeterministicCounts.get(pack.followup_pack_id) || 0;
      const activeDeterministicCount = packActiveDeterministicCounts.get(pack.followup_pack_id) || 0;
      const usageCount = packUsageCounts.get(pack.followup_pack_id) || 0;
      const usedByQuestions = packUsageQuestions.get(pack.followup_pack_id) || [];
      
      return {
        pack,
        deterministicCount,
        activeDeterministicCount,
        usageCount,
        usedByQuestions,
        flags: {
          UNUSED_PACK: usageCount === 0,
          NO_DETERMINISTIC: deterministicCount === 0,
          HEALTHY: usageCount > 0 && (deterministicCount > 0 || pack.ai_probe_instructions)
        }
      };
    });

    // Global integrity issues
    const questionsMissingPackAssignment = questionAnalysis.filter(a => !a.hasFollowUpPack);
    const questionsWithMissingPackReference = questionAnalysis.filter(a => a.hasFollowUpPack && !a.followUpPackExists);
    const questionsWithEmptyPacks = questionAnalysis.filter(a => 
      a.followUpPackExists && !a.followUpPackHasDeterministic && !a.followUpPackHasAIInstructions
    );

    return {
      questionAnalysis,
      packAnalysis,
      questionsMissingPackAssignment,
      questionsWithMissingPackReference,
      questionsWithEmptyPacks,
      packMap,
      getQuestionStatus: (question) => {
        const analysis = questionAnalysis.find(a => a.question.id === question.id);
        if (!analysis) return null;
        
        if (!analysis.hasFollowUpPack) {
          return { type: 'error', label: 'No Follow-Up Pack', color: 'red' };
        }
        if (!analysis.followUpPackExists) {
          return { type: 'error', label: `Missing Pack: ${analysis.followUpPackIdOrCode}`, color: 'red' };
        }
        if (!analysis.followUpPackHasDeterministic && !analysis.followUpPackHasAIInstructions) {
          return { type: 'warning', label: `Pack: ${analysis.followUpPackName} (No questions)`, color: 'yellow' };
        }
        return { type: 'success', label: `Pack: ${analysis.followUpPackName}`, color: 'green' };
      },
      getPackStatus: (pack) => {
        const analysis = packAnalysis.find(a => a.pack.id === pack.id);
        if (!analysis) return null;
        
        return {
          isUnused: analysis.flags.UNUSED_PACK,
          hasNoDeterministic: analysis.flags.NO_DETERMINISTIC,
          isHealthy: analysis.flags.HEALTHY,
          deterministicCount: analysis.deterministicCount,
          usageCount: analysis.usageCount
        };
      }
    };
  }, [questions, packs, followUpQuestions]);
}