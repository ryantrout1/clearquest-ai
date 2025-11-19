import { base44 } from "@/api/base44Client";

/**
 * Follow-Up Pack Integrity Audit Utility
 * 
 * Analyzes the integrity between:
 * - Interview Questions
 * - Follow-Up Packs
 * - Deterministic Follow-Up Questions
 * 
 * Usage:
 *   const result = await runFollowUpIntegrityAudit();
 *   // Check console for detailed report
 */

export async function runFollowUpIntegrityAudit() {
  console.log("🔍 Starting Follow-Up Pack Integrity Audit...");
  
  try {
    // Load all data
    const [questions, packs, deterministicQuestions] = await Promise.all([
      base44.entities.Question.list(),
      base44.entities.FollowUpPack.list(),
      base44.entities.FollowUpQuestion.list()
    ]);

    console.log(`📊 Loaded: ${questions.length} questions, ${packs.length} packs, ${deterministicQuestions.length} deterministic questions`);

    // Build lookup maps
    const packById = {};
    const packByCode = {};
    packs.forEach(pack => {
      packById[pack.id] = pack;
      if (pack.followup_pack_id) {
        packByCode[pack.followup_pack_id] = pack;
      }
    });

    const deterministicByPackId = {};
    const deterministicByPackCode = {};
    deterministicQuestions.forEach(q => {
      if (q.followup_pack_id) {
        if (!deterministicByPackCode[q.followup_pack_id]) {
          deterministicByPackCode[q.followup_pack_id] = [];
        }
        deterministicByPackCode[q.followup_pack_id].push(q);
      }
    });

    // Analyze questions
    const questionAnalysis = questions.map(q => {
      const packRef = q.followup_pack_id || q.followup_pack;
      const hasFollowUpPack = Boolean(packRef);
      const referencedPack = packRef ? (packByCode[packRef] || packById[packRef]) : null;
      const followUpPackExists = Boolean(referencedPack);
      const deterministicList = packRef ? (deterministicByPackCode[packRef] || []) : [];
      const packHasDeterministic = deterministicList.length > 0;

      let status = "HEALTHY";
      if (!hasFollowUpPack) {
        status = "NO_PACK_ASSIGNED";
      } else if (!followUpPackExists) {
        status = "BROKEN_PACK_REFERENCE";
      } else if (!packHasDeterministic) {
        status = "PACK_WITHOUT_DETERMINISTIC";
      }

      return {
        questionId: q.id,
        questionCode: q.question_id,
        questionText: q.question_text,
        sectionName: q.section_name || q.category,
        hasFollowUpPack,
        followUpPackExists,
        packHasDeterministic,
        packDeterministicCount: deterministicList.length,
        packReference: packRef,
        packName: referencedPack?.pack_name,
        status
      };
    });

    // Analyze packs
    const packAnalysis = packs.map(pack => {
      const deterministicList = deterministicByPackCode[pack.followup_pack_id] || [];
      const usedByQuestions = questions.filter(q => 
        (q.followup_pack_id === pack.followup_pack_id) || 
        (q.followup_pack === pack.followup_pack_id)
      );

      let status = "HEALTHY";
      if (usedByQuestions.length === 0) {
        status = "UNUSED";
      } else if (deterministicList.length === 0) {
        status = "NO_DETERMINISTIC";
      } else if (usedByQuestions.length >= 10) {
        status = "HIGHLY_USED";
      }

      return {
        packId: pack.id,
        packCode: pack.followup_pack_id,
        packName: pack.pack_name,
        deterministicCount: deterministicList.length,
        activeDeterministicCount: deterministicList.filter(q => q.active !== false).length,
        usageCount: usedByQuestions.length,
        usedByQuestions: usedByQuestions.map(q => ({
          questionCode: q.question_id,
          questionText: q.question_text,
          sectionName: q.section_name || q.category
        })),
        status
      };
    });

    // Categorize
    const healthyQuestions = questionAnalysis.filter(q => q.status === "HEALTHY");
    const noPackAssigned = questionAnalysis.filter(q => q.status === "NO_PACK_ASSIGNED");
    const brokenPackRef = questionAnalysis.filter(q => q.status === "BROKEN_PACK_REFERENCE");
    const packWithoutDeterministic = questionAnalysis.filter(q => q.status === "PACK_WITHOUT_DETERMINISTIC");

    const healthyPacks = packAnalysis.filter(p => p.status === "HEALTHY" || p.status === "HIGHLY_USED");
    const unusedPacks = packAnalysis.filter(p => p.status === "UNUSED");
    const packsWithoutDeterministic = packAnalysis.filter(p => p.status === "NO_DETERMINISTIC");

    // Console Report
    console.log("\n");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("        FOLLOW-UP PACK INTEGRITY AUDIT REPORT");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("\n");

    console.group("📊 SUMMARY");
    console.log(`Total Questions: ${questions.length}`);
    console.log(`Total Packs: ${packs.length}`);
    console.log(`Total Deterministic Questions: ${deterministicQuestions.length}`);
    console.log(`\n✅ Healthy Questions: ${healthyQuestions.length}`);
    console.log(`⚠️  Questions with NO Pack Assigned: ${noPackAssigned.length}`);
    console.log(`❌ Questions with BROKEN Pack Reference: ${brokenPackRef.length}`);
    console.log(`⚠️  Questions pointing to Packs with NO deterministic: ${packWithoutDeterministic.length}`);
    console.log(`\n✅ Healthy Packs: ${healthyPacks.length}`);
    console.log(`⚠️  Packs with NO deterministic questions: ${packsWithoutDeterministic.length}`);
    console.log(`⚠️  Packs with NO usage: ${unusedPacks.length}`);
    console.groupEnd();

    if (noPackAssigned.length > 0) {
      console.log("\n");
      console.group("⚠️  SECTION 1: Questions with NO Pack Assigned");
      console.table(noPackAssigned.map(q => ({
        Code: q.questionCode,
        Section: q.sectionName,
        Question: q.questionText.substring(0, 80) + (q.questionText.length > 80 ? "..." : "")
      })));
      console.groupEnd();
    }

    if (brokenPackRef.length > 0) {
      console.log("\n");
      console.group("❌ SECTION 2: Questions with BROKEN Pack Reference");
      console.table(brokenPackRef.map(q => ({
        Code: q.questionCode,
        Section: q.sectionName,
        MissingPackCode: q.packReference,
        Question: q.questionText.substring(0, 60) + (q.questionText.length > 60 ? "..." : "")
      })));
      console.groupEnd();
    }

    if (packWithoutDeterministic.length > 0) {
      console.log("\n");
      console.group("⚠️  SECTION 3: Questions pointing to Packs with NO deterministic questions");
      console.table(packWithoutDeterministic.map(q => ({
        Code: q.questionCode,
        Section: q.sectionName,
        PackName: q.packName,
        PackCode: q.packReference,
        Question: q.questionText.substring(0, 60) + (q.questionText.length > 60 ? "..." : "")
      })));
      console.groupEnd();
    }

    if (packsWithoutDeterministic.length > 0) {
      console.log("\n");
      console.group("⚠️  SECTION 4: Packs with NO deterministic questions");
      console.table(packsWithoutDeterministic.map(p => ({
        PackName: p.packName,
        PackCode: p.packCode,
        UsageCount: p.usageCount
      })));
      console.groupEnd();
    }

    if (unusedPacks.length > 0) {
      console.log("\n");
      console.group("⚠️  SECTION 5: Packs with NO usage");
      console.table(unusedPacks.map(p => ({
        PackName: p.packName,
        PackCode: p.packCode,
        DeterministicCount: p.deterministicCount
      })));
      console.groupEnd();
    }

    console.log("\n");
    console.group("📋 SECTION 6: Full Pack Usage Summary");
    console.table(packAnalysis.map(p => ({
      PackName: p.packName,
      PackCode: p.packCode,
      Deterministic: p.deterministicCount,
      Usage: p.usageCount,
      Status: p.status
    })));
    console.groupEnd();

    console.log("\n");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("                    END OF REPORT");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("\n");

    return {
      summary: {
        totalQuestions: questions.length,
        totalPacks: packs.length,
        totalDeterministic: deterministicQuestions.length,
        healthyQuestions: healthyQuestions.length,
        noPackAssigned: noPackAssigned.length,
        brokenPackRef: brokenPackRef.length,
        packWithoutDeterministic: packWithoutDeterministic.length,
        healthyPacks: healthyPacks.length,
        packsWithoutDeterministic: packsWithoutDeterministic.length,
        unusedPacks: unusedPacks.length
      },
      questions: questionAnalysis,
      packs: packAnalysis,
      issues: {
        noPackAssigned,
        brokenPackRef,
        packWithoutDeterministic,
        packsWithoutDeterministic,
        unusedPacks
      }
    };

  } catch (error) {
    console.error("❌ Audit failed:", error);
    throw error;
  }
}