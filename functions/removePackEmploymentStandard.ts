import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Surgical Maintenance Script: Remove PACK_EMPLOYMENT_STANDARD
 * 
 * SAFETY-FIRST deletion with multiple guardrails:
 * 1. Check if pack exists
 * 2. Check if any Questions reference it (HARD ABORT if yes)
 * 3. Delete legacy FollowUpQuestion records
 * 4. Delete the FollowUpPack
 * 5. Verify clean removal
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verify admin authentication
    const user = await base44.auth.me();
    if (!user || user.role !== 'SUPER_ADMIN') {
      return Response.json({ 
        error: 'Unauthorized - SUPER_ADMIN access required' 
      }, { status: 403 });
    }

    const TARGET_PACK_ID = "PACK_EMPLOYMENT_STANDARD";
    const report = {
      pack_id: TARGET_PACK_ID,
      status: null,
      pack_found: false,
      questions_referencing: [],
      legacy_followup_questions_found: 0,
      deleted_followup_questions: 0,
      deleted_pack: false,
      verification: {},
      message: null
    };

    // ============================================================
    // STEP 1: Locate the pack
    // ============================================================
    const packs = await base44.asServiceRole.entities.FollowUpPack.filter({
      followup_pack_id: TARGET_PACK_ID
    });
    
    const packExists = packs && packs.length > 0;
    report.pack_found = packExists;
    
    if (!packExists) {
      report.status = "PACK_NOT_FOUND";
      report.message = `${TARGET_PACK_ID} not found in FollowUpPack — checking for orphaned references...`;
    }

    // ============================================================
    // STEP 2: Check for Question references (HARD GUARDRAIL)
    // ============================================================
    const referencingQuestions = await base44.asServiceRole.entities.Question.filter({
      followup_pack: TARGET_PACK_ID
    });
    
    if (referencingQuestions && referencingQuestions.length > 0) {
      report.status = "ABORTED_QUESTIONS_EXIST";
      report.questions_referencing = referencingQuestions.map(q => ({
        question_id: q.question_id,
        question_text: q.question_text?.substring(0, 80) + '...',
        section_id: q.section_id,
        id: q.id
      }));
      report.message = `ABORTED: ${TARGET_PACK_ID} is still referenced by ${referencingQuestions.length} question(s). No deletions performed.`;
      
      return Response.json(report, { status: 200 });
    }

    // ============================================================
    // STEP 3: Identify legacy FollowUpQuestion records
    // ============================================================
    const legacyFollowUpQuestions = await base44.asServiceRole.entities.FollowUpQuestion.filter({
      followup_pack_id: TARGET_PACK_ID
    });
    
    report.legacy_followup_questions_found = legacyFollowUpQuestions?.length || 0;

    // ============================================================
    // STEP 4: DELETE OPERATIONS (only if no Question references)
    // ============================================================
    
    // 4a. Delete legacy FollowUpQuestion records
    if (legacyFollowUpQuestions && legacyFollowUpQuestions.length > 0) {
      for (const fuq of legacyFollowUpQuestions) {
        await base44.asServiceRole.entities.FollowUpQuestion.delete(fuq.id);
        report.deleted_followup_questions++;
      }
    }

    // 4b. Delete the FollowUpPack (if it exists)
    if (packExists && packs.length > 0) {
      await base44.asServiceRole.entities.FollowUpPack.delete(packs[0].id);
      report.deleted_pack = true;
    }

    // ============================================================
    // STEP 5: POST-DELETE VERIFICATION
    // ============================================================
    const packVerify = await base44.asServiceRole.entities.FollowUpPack.filter({
      followup_pack_id: TARGET_PACK_ID
    });
    
    const fuqVerify = await base44.asServiceRole.entities.FollowUpQuestion.filter({
      followup_pack_id: TARGET_PACK_ID
    });
    
    const questionVerify = await base44.asServiceRole.entities.Question.filter({
      followup_pack: TARGET_PACK_ID
    });

    report.verification = {
      packs_remaining: packVerify?.length || 0,
      followup_questions_remaining: fuqVerify?.length || 0,
      questions_still_referencing: questionVerify?.length || 0
    };

    // ============================================================
    // FINAL STATUS
    // ============================================================
    const isClean = 
      report.verification.packs_remaining === 0 &&
      report.verification.followup_questions_remaining === 0 &&
      report.verification.questions_still_referencing === 0;

    if (!packExists && report.deleted_followup_questions === 0) {
      report.status = "ALREADY_CLEAN";
      report.message = `${TARGET_PACK_ID} not found in FollowUpPack — already removed or never existed. No action taken.`;
    } else if (isClean) {
      report.status = "SUCCESS";
      report.message = `SUCCESS: Removed ${TARGET_PACK_ID}. Deleted ${report.deleted_pack ? '1 FollowUpPack' : '0 FollowUpPacks'} and ${report.deleted_followup_questions} FollowUpQuestion record(s). Verified 0 Questions still reference this pack.`;
    } else {
      report.status = "WARNING_VERIFICATION_FAILED";
      report.message = `Deletion completed but verification shows remaining references. Check verification details.`;
    }

    return Response.json(report, { status: 200 });

  } catch (error) {
    console.error('Error in removePackEmploymentStandard:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});