/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FORENSIC AUDIT REPORT: V2 FACT-ANCHOR PIPELINE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Generated: 2025-12-06
 * Target: PACK_PRIOR_LE_APPS_STANDARD / PACK_PRLE_Q01
 * Issue: Anchors not being returned despite narrative containing "disqualified"
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE 1: FUNCTION ENUMERATION & DEPENDENCY GRAPH
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * EXTRACTION LAYER (probeEngineV2.js):
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ 1. extractPriorLeAppsOutcomeAnchors(fieldTextRaw)               │
 * │    Purpose: NEW surgical extractor for application_outcome       │
 * │    Input: Raw narrative text string                              │
 * │    Output: { anchors: {application_outcome}, collectedAnchors }  │
 * │    Called by: Manual injection after handler (lines 4642-4687)   │
 * │                                                                   │
 * │ 2. inferApplicationOutcomeFromNarrative(narrativeRaw)            │
 * │    Purpose: Legacy deterministic outcome extractor               │
 * │    Input: Raw narrative text string                              │
 * │    Output: "disqualified"|"hired"|"withdrew"|"in_process"|null   │
 * │    Called by: handlePriorLeAppsPerFieldV2 (line 4228)            │
 * │                                                                   │
 * │ 3. extractPriorLeAppsAnchors({ text })                           │
 * │    Purpose: Centralized multi-anchor extractor                   │
 * │    Input: { text: narrativeString }                              │
 * │    Output: { anchors: {...}, collectedAnchors: {...} }           │
 * │    Called by: handlePriorLeAppsPerFieldV2 (line 4232)            │
 * │    Registered in: FIELD_ANCHOR_EXTRACTORS (line 2652)            │
 * │                                                                   │
 * │ 4. extractFactAnchorsForField({ packId, fieldKey, fieldValue }) │
 * │    Purpose: OLD deterministic extractor (deprecated?)            │
 * │    Input: Pack ID, field key, field value                        │
 * │    Output: { anchors: {...}, collectedAnchors: {...} }           │
 * │    Called by: handlePriorLeAppsQ01 (line 4330)                   │
 * │    Registered in: ANCHOR_EXTRACTORS (line 296)                   │
 * └──────────────────────────────────────────────────────────────────┘
 * 
 * HANDLER LAYER (probeEngineV2.js):
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ 5. handlePriorLeAppsPerFieldV2(ctx)                              │
 * │    Purpose: Main per-field handler for PACK_PRIOR_LE_APPS        │
 * │    Input: ctx with packId, fieldKey, fieldValue, etc.            │
 * │    Output: V2ProbeResult with anchors/collectedAnchors           │
 * │    Called by: Router when perFieldHandler exists (line 4640)     │
 * │    Special: ONLY executes for PACK_PRLE_Q01 (line 4219)          │
 * │                                                                   │
 * │ 6. handlePriorLeAppsQ01({...})                                   │
 * │    Purpose: Legacy/deprecated dedicated Q01 handler              │
 * │    Input: pack_id, field_key, field_value, incident_context      │
 * │    Output: V2ProbeResult via createV2ProbeResult                 │
 * │    Called by: Early router (line 4860) - CONDITIONAL             │
 * └──────────────────────────────────────────────────────────────────┘
 * 
 * MERGE LAYER (probeEngineV2.js):
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ 7. mergeAnchors(existingAnchors, newAnchors)                     │
 * │    Purpose: Shallow merge of two anchor objects                  │
 * │    Input: Two anchor objects                                     │
 * │    Output: Merged object (newAnchors takes precedence)           │
 * │    Called by: Multiple locations                                 │
 * │              - Line 4746 (handler + factEngine)                  │
 * │              - Line 4782 (currentAnchors + instance_anchors)     │
 * │              - Line 4876 (currentAnchors + handler.anchors)      │
 * └──────────────────────────────────────────────────────────────────┘
 * 
 * NORMALIZATION LAYER (probeEngineV2.js):
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ 8. createV2ProbeResult(base, anchors, collectedAnchors)         │
 * │    Purpose: Construct standardized V2 result object              │
 * │    Input: base result + optional anchors                         │
 * │    Output: { mode, hasQuestion, anchors, collectedAnchors, ... } │
 * │    Called by: All handlers and final return paths                │
 * │    Signature: 1-arg (legacy) or 3-arg (explicit)                 │
 * │                                                                   │
 * │ 9. normalizeV2ProbeResult(rawResult, extra)                      │
 * │    Purpose: Safety net - ensure anchors/collectedAnchors exist   │
 * │    Input: Raw result from probeEngineV2Core                      │
 * │    Output: Normalized result with guaranteed shape               │
 * │    Called by: probeEngineV2 wrapper (line 5427)                  │
 * │                                                                   │
 * │ 10. normalizeV2Result(result)                                    │
 * │     Purpose: Alternative normalizer (calls createV2ProbeResult)  │
 * │     Input: Raw result                                            │
 * │     Output: Normalized via createV2ProbeResult                   │
 * │     Called by: HTTP handler line 5559                            │
 * └──────────────────────────────────────────────────────────────────┘
 * 
 * FACTANCHORENGINE LAYER (factAnchorEngine.js):
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ 11. FactAnchorEngine.extract(ctx)                                │
 * │     Purpose: Secondary extraction layer with confidence scoring  │
 * │     Input: ctx with packId, fieldKey, answerText                 │
 * │     Output: { anchors: {...}, collectedAnchors: {...} }          │
 * │     Called by: Per-field router (line 4731)                      │
 * │                                                                   │
 * │ 12. extractNarrative(ctx)                                        │
 * │     Purpose: Extract from long-form PACK_PRLE_Q01 narratives     │
 * │     Input: ctx with packId, fieldKey, answerText                 │
 * │     Output: { anchors: {...}, confidence: {...} }                │
 * │     Called by: FactAnchorEngine.extract (line 31)                │
 * │                                                                   │
 * │ 13. extractShortForm(ctx)                                        │
 * │     Purpose: Extract from short-form PACK_PRLE_Q02 answers       │
 * │     Input: ctx with packId, fieldKey, answerText                 │
 * │     Output: { anchors: {...}, confidence: {...} }                │
 * │     Called by: FactAnchorEngine.extract (line 32)                │
 * │                                                                   │
 * │ 14. pickBestAnchors(narr, short)                                 │
 * │     Purpose: Merge narrative + short form with confidence        │
 * │     Input: Two extraction results with confidence scores         │
 * │     Output: Best anchor values based on confidence               │
 * │     Called by: FactAnchorEngine.extract (line 35)                │
 * └──────────────────────────────────────────────────────────────────┘
 * 
 * ENTRYPOINTS & ROUTING (probeEngineV2.js):
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ 15. Deno.serve() HTTP Handler                                    │
 * │     Line: 5433                                                   │
 * │     Receives: POST with JSON body                                │
 * │     Calls: probeEngineV2(input, base44) → line 5534              │
 * │     Returns: Response.json(result) → line 5601                   │
 * │                                                                   │
 * │ 16. probeEngineV2(input, base44Client)                           │
 * │     Line: 5425                                                   │
 * │     Purpose: Normalized wrapper around core                      │
 * │     Calls: probeEngineV2Core() → line 5426                       │
 * │     Normalizes: via normalizeV2ProbeResult → line 5427           │
 * │                                                                   │
 * │ 17. probeEngineV2Core(input, base44Client)                       │
 * │     Line: 4568                                                   │
 * │     Purpose: Main routing and business logic                     │
 * │     Routes to: perFieldHandler if exists → line 4596-4778        │
 * │               OR early router → line 4800-4935                   │
 * │               OR universal MVP logic → line 4938+                │
 * └──────────────────────────────────────────────────────────────────┘
 * 
 * DEPENDENCY GRAPH:
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * HTTP Request → Deno.serve() 
 *   ↓
 *   probeEngineV2(input, base44)
 *   ↓
 *   probeEngineV2Core(input, base44)
 *   ↓
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ ROUTING DECISION (lines 4596-4779)                          │
 *   │                                                              │
 *   │ IF packConfig.perFieldHandler exists:                        │
 *   │   ├─→ handlePriorLeAppsPerFieldV2(ctx)                       │
 *   │   │   ├─→ getFieldNarrativeText(ctx) → extract text          │
 *   │   │   ├─→ inferApplicationOutcomeFromNarrative(text)         │
 *   │   │   ├─→ extractPriorLeAppsAnchors({ text })                │
 *   │   │   └─→ createV2ProbeResult(base, anchors, collected)      │
 *   │   │                                                           │
 *   │   ├─→ [SURGICAL INJECTION] extractPriorLeAppsOutcomeAnchors  │
 *   │   │   (lines 4642-4687 - NEW as of today)                    │
 *   │   │                                                           │
 *   │   ├─→ FactAnchorEngine.extract(factCtx)                      │
 *   │   │   ├─→ extractNarrative(ctx)                              │
 *   │   │   ├─→ extractShortForm(ctx)                              │
 *   │   │   └─→ pickBestAnchors(narr, short)                       │
 *   │   │                                                           │
 *   │   └─→ mergeAnchors(handler, factEngine) → lines 4746-4750    │
 *   │                                                               │
 *   │ ELSE IF early router conditions met (lines 4815-4935):       │
 *   │   ├─→ extractFactAnchorsForField() [deprecated]              │
 *   │   ├─→ extractAnchorsFromNarrative() [centralized]            │
 *   │   ├─→ handlePriorLeAppsQ01()                                 │
 *   │   └─→ createV2ProbeResult()                                  │
 *   │                                                               │
 *   │ ELSE: Universal MVP logic (lines 4938+)                       │
 *   │   ├─→ Discretion Engine                                       │
 *   │   ├─→ extractAnchorsForField() [GOLDEN MVP]                  │
 *   │   └─→ createV2ProbeResult()                                  │
 *   └─────────────────────────────────────────────────────────────┘
 *   ↓
 *   normalizeV2ProbeResult(rawResult)
 *   ↓
 *   normalizeV2Result(result) [HTTP handler]
 *   ↓
 *   Response.json(result)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE 2: RUNTIME PATH TRACE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ACTUAL EXECUTION PATH for PACK_PRIOR_LE_APPS_STANDARD / PACK_PRLE_Q01:
 * 
 * Step 1: HTTP Handler receives POST
 *   - Input properties: field_value, fieldValue, fullNarrative, narrative, etc.
 *   - Canonical narrative: FIRST non-null from priority list
 *   - Lines: 5433-5640
 * 
 * Step 2: probeEngineV2Core entry
 *   - Extracts: pack_id, field_key, field_value, incident_context
 *   - Line 4568: Entry point
 *   - Line 4596: Check for packConfig.perFieldHandler
 * 
 * Step 3: Router finds perFieldHandler
 *   - Line 4599: packConfig = PACK_CONFIG["PACK_PRIOR_LE_APPS_STANDARD"]
 *   - Line 4600: perFieldHandler = handlePriorLeAppsPerFieldV2
 *   - Line 4606: Build ctx object with ALL input properties
 * 
 * Step 4: handlePriorLeAppsPerFieldV2 executes
 *   - Line 4208: getFieldNarrativeText(ctx) → extract canonical text
 *   - Line 4219: IF fieldKey === "PACK_PRLE_Q01" check
 *   - Line 4228: inferApplicationOutcomeFromNarrative(narrativeText)
 *   - Line 4232: extractPriorLeAppsAnchors({ text: narrativeText })
 *   - Lines 4253-4259: Merge extracted anchors into result
 *   - Line 4274: createV2ProbeResult(baseResult, anchors, collectedAnchorsResult)
 *   - Line 4286: RETURN finalResult
 * 
 * Step 5: Surgical injection (NEW - lines 4642-4687)
 *   - AFTER handler returns
 *   - Extracts fieldText from input (field_value, fieldValue, etc.)
 *   - Calls: extractPriorLeAppsOutcomeAnchors(fieldText)
 *   - Merges into: handlerResult.anchors and handlerResult.collectedAnchors
 *   - CRITICAL: Uses spread operator to merge
 * 
 * Step 6: FactAnchorEngine layer
 *   - Line 4731: FactAnchorEngine.extract(factCtx)
 *   - factCtx.answerText from: field_value || ctx.fullNarrative || ctx.fullAnswer || ctx.answer
 *   - Calls extractNarrative() and extractShortForm()
 *   - Line 4746-4750: Merge into handlerResult
 * 
 * Step 7: Return from perFieldHandler router
 *   - Line 4778: RETURN handlerResult
 *   - ⚠️ CRITICAL BRANCH POINT: Control flow exits router here
 * 
 * Step 8: Normalize and return
 *   - Line 5427: normalizeV2ProbeResult(rawResult)
 *   - Line 5559: normalizeV2Result(result)
 *   - Line 5601: Response.json(result)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE 3: FACTANCHORENGINE FORENSICS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * FactAnchorEngine.extract() ANALYSIS:
 * 
 * Input Schema:
 * {
 *   packId: "PACK_PRIOR_LE_APPS_STANDARD",
 *   fieldKey: "PACK_PRLE_Q01",
 *   answerText: "(narrative text)",
 *   questionId: "Q001",
 *   sessionId: "(session ID)",
 *   instanceNumber: 1,
 *   anchors: {} || {...},
 *   collectedAnchors: {} || {...}
 * }
 * 
 * Output Schema (EXPECTED):
 * {
 *   anchors: {
 *     application_outcome: "disqualified",
 *     prior_le_agency: "Phoenix Police Department",
 *     prior_le_position: "police officer",
 *     prior_le_approx_date: "March 2022"
 *   },
 *   collectedAnchors: {
 *     application_outcome: "disqualified",
 *     prior_le_agency: "Phoenix Police Department",
 *     prior_le_position: "police officer",
 *     prior_le_approx_date: "March 2022"
 *   }
 * }
 * 
 * Output Schema (ACTUAL - from logs):
 * {
 *   anchors: {},
 *   collectedAnchors: {}
 * }
 * 
 * Root Cause in FactAnchorEngine:
 * - extractNarrative() DOES extract correctly (lines 60-156)
 * - extractShortForm() returns empty for Q01 (correct - it's for Q02)
 * - pickBestAnchors() merges correctly
 * - HOWEVER: extract() function RETURNS the merged object
 * - BUT: The returned object is NOT being propagated back to caller
 * 
 * ⚠️ KEY FINDING: FactAnchorEngine extraction WORKS internally but results
 * are not being properly merged into final probe result.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE 4: SCHEMA COMPARISON
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * EXPECTED ANCHOR SCHEMA (per PACK_CONFIG lines 2422-2427):
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ requiredAnchors: [                                              │
 * │   "agency_name",          ← MISMATCH: extractor uses "prior_le_agency"
 * │   "position",             ← MISMATCH: extractor uses "prior_le_position"
 * │   "month_year",           ← MISMATCH: extractor uses "prior_le_approx_date"
 * │   "application_outcome"   ← MATCH                               │
 * │ ]                                                                │
 * └─────────────────────────────────────────────────────────────────┘
 * 
 * ACTUAL EXTRACTOR OUTPUT (per extractPriorLeAppsAnchors lines 370-430):
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ anchors: {                                                       │
 * │   "application_outcome": "Disqualified",  ← Capitalized!         │
 * │   "prior_le_agency": "...",               ← Different key!       │
 * │   "prior_le_position": "...",             ← Different key!       │
 * │   "prior_le_approx_date": "..."           ← Different key!       │
 * │ }                                                                │
 * └─────────────────────────────────────────────────────────────────┘
 * 
 * ANCHOR KEY MISMATCHES:
 * ┌──────────────────────┬────────────────────────┬──────────────────┐
 * │ Semantic Role        │ PACK_CONFIG expects    │ Extractor uses   │
 * ├──────────────────────┼────────────────────────┼──────────────────┤
 * │ Agency               │ "agency_name"          │ "prior_le_agency"│
 * │ Position             │ "position"             │ "prior_le_position"
 * │ Date                 │ "month_year"           │ "prior_le_approx_date"
 * │ Outcome              │ "application_outcome"  │ "application_outcome" ✓
 * └──────────────────────┴────────────────────────┴──────────────────┘
 * 
 * CAPITALIZATION MISMATCHES:
 * - extractPriorLeAppsAnchors returns "Disqualified" (line 384)
 * - extractPriorLeAppsOutcomeAnchors returns "disqualified" (line 720)
 * - inferApplicationOutcomeFromNarrative returns "disqualified" (line 785)
 * - Frontend/gating expects lowercase canonical values
 * 
 * ⚠️ KEY FINDING: Multiple schema mismatches between extractors and config.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE 5: TEST HARNESS FORENSICS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * testV2PriorLeAppsAnchors.js Analysis:
 * 
 * Test Parameters (lines 23-37):
 * {
 *   pack_id: 'PACK_PRIOR_LE_APPS_STANDARD',
 *   field_key: 'PACK_PRLE_Q01',
 *   field_value: narrative,           ✓ Matches backend expectation
 *   fieldValue: narrative,            ✓ Fallback provided
 *   fullNarrative: narrative,         ✓ Fallback provided
 *   narrative: narrative,             ✓ Fallback provided
 *   fieldValuePreview: narrative.slice(0, 120),
 *   previous_probes_count: 0,         ✓ Correct
 *   incident_context: {},             ✓ Empty for first field
 *   instance_number: 1,               ✓ Correct
 *   sectionName: '...',
 *   baseQuestionText: '...',
 *   questionCode: 'Q001'              ✓ Correct
 * }
 * 
 * Test Assertions (lines 85-88):
 * ✓ Checks for anchors.application_outcome OR collectedAnchors.application_outcome
 * ✓ Expects "disqualified"
 * ✓ Checks both objects exist
 * 
 * Test Result Reading (lines 48-72):
 * ✓ Correctly reads response.data
 * ✓ Normalizes to result object
 * ✓ Accesses result.anchors and result.collectedAnchors
 * 
 * ⚠️ TEST HARNESS IS CORRECTLY CONFIGURED
 * The test sends narrative in ALL expected properties and reads anchors correctly.
 * If test fails, the backend is NOT returning anchors.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE 6: FIRST BREAKPOINT IDENTIFICATION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * CRITICAL DISCOVERY - THE ACTUAL EXECUTION PATH:
 * 
 * Given inputs:
 *   - pack_id: "PACK_PRIOR_LE_APPS_STANDARD"
 *   - field_key: "PACK_PRLE_Q01"
 *   - previous_probes_count: 0
 *   - field_value: "(disqualified narrative)"
 * 
 * Execution trace:
 * 
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ Line 4596: Check packConfig.perFieldHandler                        │
 * │   packConfig = PACK_CONFIG["PACK_PRIOR_LE_APPS_STANDARD"]          │
 * │   perFieldHandler = handlePriorLeAppsPerFieldV2                    │
 * │   Result: TRUE - handler exists                                    │
 * └─────────────────────────────────────────────────────────────────────┘
 *   ↓
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ Lines 4606-4637: Build ctx object                                  │
 * │   ctx.fieldValue = field_value                                     │
 * │   ctx.field_value = field_value                                    │
 * │   ctx.fullNarrative = input.fullNarrative                          │
 * │   (etc.)                                                            │
 * └─────────────────────────────────────────────────────────────────────┘
 *   ↓
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ Line 4640: Call packConfig.perFieldHandler(ctx)                    │
 * │   → handlePriorLeAppsPerFieldV2(ctx)                               │
 * └─────────────────────────────────────────────────────────────────────┘
 *   ↓
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ handlePriorLeAppsPerFieldV2 INTERNAL:                              │
 * │                                                                     │
 * │ Line 4208: narrativeText = getFieldNarrativeText(ctx)              │
 * │   → Returns: ctx.fieldValue || ctx.field_value || ...             │
 * │   ✓ Contains: "...was disqualified during..."                     │
 * │                                                                     │
 * │ Line 4219: IF fieldKey === "PACK_PRLE_Q01"                         │
 * │   → TRUE, enters Q01 branch                                        │
 * │                                                                     │
 * │ Lines 4223-4224: Initialize anchor objects                         │
 * │   anchors = { ...existingCollection }                              │
 * │   collectedAnchorsResult = { ...existingCollection }               │
 * │   (existingCollection = incident_context = {})                     │
 * │                                                                     │
 * │ Line 4228: outcomeNew = inferApplicationOutcomeFromNarrative(...)  │
 * │   → Input: narrativeText (contains "disqualified")                 │
 * │   → Output: "disqualified" ✓                                       │
 * │                                                                     │
 * │ Line 4232: legacyExtraction = extractPriorLeAppsAnchors(...)       │
 * │   → Input: { text: narrativeText }                                 │
 * │   → Output: { anchors: { application_outcome: "Disqualified" } }   │
 * │   ⚠️ NOTE: Capital "D"!                                            │
 * │                                                                     │
 * │ Line 4239: outcome = outcomeNew || legacyExtraction.anchors.app... │
 * │   → outcomeNew = "disqualified" ✓                                  │
 * │   → Final: outcome = "disqualified"                                │
 * │                                                                     │
 * │ Lines 4251-4254: Merge legacy anchors                              │
 * │   anchors = { ...anchors, ...legacyExtraction.anchors }            │
 * │   collectedAnchorsResult = { ...collected, ...legacy.anchors }     │
 * │   ✓ Both now contain application_outcome: "Disqualified"          │
 * │                                                                     │
 * │ Lines 4257-4260: Set outcome explicitly                            │
 * │   anchors = { ...anchors, application_outcome: "disqualified" }    │
 * │   collectedAnchorsResult = { ...collected, application_outcome }   │
 * │   ✓ Both now have application_outcome: "disqualified" (lowercase)  │
 * │                                                                     │
 * │ Line 4274: finalResult = createV2ProbeResult(baseResult, ...)     │
 * │   Arguments:                                                       │
 * │     - baseResult: { mode: "NEXT_FIELD", hasQuestion: false, ... }  │
 * │     - anchors: { application_outcome: "disqualified", ... }        │
 * │     - collectedAnchorsResult: { application_outcome: "disq...", ...}
 * │   ✓ Anchors passed correctly to createV2ProbeResult               │
 * │                                                                     │
 * │ Line 4286: RETURN finalResult                                      │
 * │   ⚠️ BREAKPOINT 1: What does finalResult contain at this point?   │
 * └─────────────────────────────────────────────────────────────────────┘
 *   ↓
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ ⚠️ CRITICAL: BACK IN probeEngineV2Core (lines 4640 → 4778)        │
 * │                                                                     │
 * │ Line 4640: handlerResult = await packConfig.perFieldHandler(ctx)   │
 * │   → handlePriorLeAppsPerFieldV2 returned finalResult               │
 * │   ⚠️ handlerResult now = finalResult from handler                  │
 * │                                                                     │
 * │ Lines 4642-4687: SURGICAL INJECTION BLOCK                          │
 * │   IF pack_id === "PACK_PRIOR_LE_APPS_STANDARD" AND                │
 * │      field_key === "PACK_PRLE_Q01":                                │
 * │                                                                     │
 * │   Line 4645-4651: Get fieldText from input                         │
 * │     fieldText = input.field_value ?? input.fieldValue ?? ...       │
 * │     ✓ Contains narrative                                           │
 * │                                                                     │
 * │   Line 4653-4654: Call extractPriorLeAppsOutcomeAnchors(fieldText) │
 * │     → Returns: { anchors: {app_out: "disq"}, collected: {...} }   │
 * │     ✓ Extraction works                                             │
 * │                                                                     │
 * │   Lines 4657-4665: Normalize handlerResult anchor containers       │
 * │     Ensures handlerResult.anchors and .collectedAnchors are objects│
 * │     ⚠️ POTENTIAL ISSUE: What if these were already set by handler? │
 * │                                                                     │
 * │   Lines 4667-4676: MERGE anchors                                   │
 * │     handlerResult.anchors = {                                      │
 * │       ...outcomeAnchors,        ← From extractPriorLeAppsOutcome   │
 * │       ...handlerResult.anchors, ← From handlePriorLeAppsPerFieldV2 │
 * │     }                                                               │
 * │                                                                     │
 * │     ⚠️ CRITICAL BUG: Merge order is WRONG!                         │
 * │     The handler's anchors overwrite the outcome anchors            │
 * │     because handler anchors come SECOND in spread                  │
 * │                                                                     │
 * │     EXPECTED: outcomeAnchors should take precedence                │
 * │     ACTUAL: handlerResult.anchors overwrites outcomeAnchors        │
 * │                                                                     │
 * │   Lines 4679-4686: Log diagnostic                                  │
 * │     ✓ Shows merged result (but merge order is wrong)              │
 * └─────────────────────────────────────────────────────────────────────┘
 *   ↓
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ Lines 4689-4710: Log handler result structure                      │
 * │   handlerResult.anchors = ???                                      │
 * │   handlerResult.collectedAnchors = ???                             │
 * │   ⚠️ CRITICAL: Check if handler anchors are empty objects          │
 * └─────────────────────────────────────────────────────────────────────┘
 *   ↓
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ Lines 4713-4750: FactAnchorEngine merge                            │
 * │   factCtx.answerText = field_value || ...                          │
 * │   factResult = FactAnchorEngine.extract(factCtx)                   │
 * │   mergedAnchors = mergeAnchors(handlerResult.anchors, factAnchors) │
 * │                                                                     │
 * │   ⚠️ QUESTION: Are handlerResult.anchors empty at this point?      │
 * │   If YES → factAnchors will be merged into empty object ✓          │
 * │   If NO → factAnchors will OVERWRITE handler anchors ✗             │
 * └─────────────────────────────────────────────────────────────────────┘
 *   ↓
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ Line 4778: RETURN handlerResult                                    │
 * │   ⚠️ BREAKPOINT 2: handlerResult at final return                   │
 * │   Does it contain merged anchors?                                  │
 * └─────────────────────────────────────────────────────────────────────┘
 *   ↓
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ ⚠️ CRITICAL OBSERVATION:                                           │
 * │                                                                     │
 * │ The perFieldHandler router has NO CODE after line 4778!            │
 * │ The function returns immediately after handler completes.          │
 * │                                                                     │
 * │ The code at lines 4781-4935 (early router) is UNREACHABLE          │
 * │ when perFieldHandler exists!                                       │
 * │                                                                     │
 * │ hasPerFieldHandler check at line 4793 explicitly SKIPs early router│
 * └─────────────────────────────────────────────────────────────────────┘
 *   ↓
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ Line 5427: normalizeV2ProbeResult(handlerResult)                   │
 * │   Ensures anchors/collectedAnchors exist as objects                │
 * │   Returns: { ...handlerResult, anchors: {...}, collectedAnchors }  │
 * │   ⚠️ Does NOT modify anchor contents, only ensures they exist      │
 * └─────────────────────────────────────────────────────────────────────┘
 *   ↓
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ Line 5559: normalizeV2Result(result)                               │
 * │   Routes through createV2ProbeResult again                         │
 * │   ⚠️ Potential double normalization?                               │
 * └─────────────────────────────────────────────────────────────────────┘
 *   ↓
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ Line 5601: Response.json(result)                                   │
 * │   ⚠️ FINAL BREAKPOINT: What does result contain here?              │
 * └─────────────────────────────────────────────────────────────────────┘
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * SMOKING GUN ANALYSIS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * HYPOTHESIS 1: Merge order bug in surgical injection (lines 4667-4676)
 * ────────────────────────────────────────────────────────────────────
 * Current code:
 *   handlerResult.anchors = {
 *     ...outcomeAnchors,        ← {application_outcome: "disqualified"}
 *     ...handlerResult.anchors, ← IF THIS IS {}, merge succeeds
 *   }                              IF THIS IS {foo: "bar"}, outcome survives
 *                                  IF THIS IS {application_outcome: ""},
 *                                     outcome is OVERWRITTEN with ""
 * 
 * FIX REQUIRED: Swap merge order OR verify handler returns empty anchors
 * 
 * HYPOTHESIS 2: createV2ProbeResult signature confusion
 * ────────────────────────────────────────────────────────────────────
 * Line 4274: createV2ProbeResult(baseResult, anchors, collectedAnchorsResult)
 *   → 3-argument call
 * 
 * Line 4523: createV2ProbeResult definition
 *   if (arguments.length === 1 && base.anchors !== undefined) {
 *     → Uses base.anchors from FIRST argument
 *     → IGNORES second and third arguments!
 *   }
 * 
 * ⚠️ CRITICAL BUG FOUND:
 * When called with 3 arguments, if base (first arg) has ANY anchor property
 * (even if empty), the function uses ONLY base.anchors and IGNORES the
 * explicit anchors passed as arguments 2 and 3!
 * 
 * Lines 4263-4272 in handlePriorLeAppsPerFieldV2:
 *   baseResult = {
 *     mode: "NEXT_FIELD",
 *     hasQuestion: false,
 *     followupsCount: 0,
 *     reason: "...",
 *     // ⚠️ NO anchors or collectedAnchors properties in baseResult
 *   };
 * 
 * Line 4274:
 *   finalResult = createV2ProbeResult(baseResult, anchors, collectedAnchorsResult);
 * 
 * Inside createV2ProbeResult (line 4525):
 *   if (arguments.length === 1 && base.anchors !== undefined)
 *     → arguments.length = 3, so condition is FALSE
 *     → Falls through to line 4538
 * 
 * Line 4538-4542:
 *   return {
 *     ...base,                      ← Spreads baseResult
 *     anchors: anchors || {},       ← Uses argument 2 ✓
 *     collectedAnchors: collectedAnchors || {}, ← Uses argument 3 ✓
 *   };
 * 
 * ✓ createV2ProbeResult IS working correctly for 3-arg calls!
 * 
 * HYPOTHESIS 3: Handler returns empty anchors that overwrite injected anchors
 * ────────────────────────────────────────────────────────────────────
 * 
 * Line 4274 in handlePriorLeAppsPerFieldV2:
 *   finalResult = createV2ProbeResult(baseResult, anchors, collectedAnchorsResult)
 *   → finalResult.anchors should contain {application_outcome: "disqualified"}
 *   → finalResult.collectedAnchors should contain same
 * 
 * Line 4286:
 *   return finalResult;
 *   → Handler returns to line 4640
 * 
 * Line 4640:
 *   handlerResult = await packConfig.perFieldHandler(ctx);
 *   → handlerResult = finalResult
 *   → handlerResult.anchors should be {application_outcome: "disqualified"}
 * 
 * Lines 4642-4687: Surgical injection
 *   IF pack_id === "PACK_PRIOR_LE_APPS_STANDARD" && field_key === "PACK_PRLE_Q01"
 *   → Calls extractPriorLeAppsOutcomeAnchors(fieldText)
 *   → Gets: { anchors: {app_out: "disq"}, collectedAnchors: {...} }
 * 
 *   Lines 4657-4665: Normalize
 *     if (!handlerResult.anchors || typeof !== "object") {
 *       handlerResult.anchors = {};
 *     }
 *     ⚠️ CRITICAL: If handlerResult.anchors EXISTS and is an object,
 *        this code does NOT reset it to {}
 *        So if handler set it to {application_outcome: "disqualified"},
 *        it STAYS as that object
 * 
 *   Lines 4667-4676: Merge
 *     handlerResult.anchors = {
 *       ...outcomeAnchors,          ← {application_outcome: "disqualified"}
 *       ...handlerResult.anchors,   ← {application_outcome: "disqualified"}
 *     }
 *     → Result: {application_outcome: "disqualified"} ✓
 * 
 * ✓ NO BUG in surgical injection if handler returns proper anchors!
 * 
 * HYPOTHESIS 4: Handler returns baseResult without merging anchors properly
 * ────────────────────────────────────────────────────────────────────
 * 
 * Line 4495 in handlePriorLeAppsPerFieldV2:
 *   return createV2ProbeResult({
 *     mode: "NEXT_FIELD",
 *     pack_id,
 *     field_key,
 *     ...
 *     anchors,                      ← {application_outcome: "disqualified"}
 *     collectedAnchors: anchors     ← {application_outcome: "disqualified"}
 *   });
 * 
 * ⚠️ WAIT - This is a DIFFERENT code path!
 * Line 4495 is for NON-Q01 fields (the ELSE branch at line 4290)
 * 
 * For Q01, the return is at line 4286:
 *   return finalResult;
 *   where finalResult was created at line 4274 using the 3-arg signature
 * 
 * ✓ Handler logic appears correct
 * 
 * HYPOTHESIS 5: createV2ProbeResult is being called TWICE, second call loses anchors
 * ────────────────────────────────────────────────────────────────────
 * 
 * Call 1: Line 4274 in handlePriorLeAppsPerFieldV2
 *   createV2ProbeResult(baseResult, anchors, collectedAnchorsResult)
 *   → Returns finalResult with anchors ✓
 * 
 * Call 2: Line 5427 in probeEngineV2
 *   normalizeV2ProbeResult(rawResult)
 *   → rawResult = handlerResult from line 4640
 *   → Calls createV2ProbeResult internally? NO - different function
 * 
 * Line 2739 - normalizeV2ProbeResult:
 *   return {
 *     ...base,                    ← Spreads rawResult (handlerResult)
 *     anchors,                    ← Normalized from base.anchors
 *     collectedAnchors,           ← Normalized from base.collectedAnchors
 *     ...extra,
 *   };
 * 
 * Lines 2742-2747:
 *   const anchors = base.anchors && typeof base.anchors === "object" && !Array.isArray(base.anchors)
 *     ? base.anchors
 *     : {};
 * 
 * ⚠️ CRITICAL: If base.anchors is a valid object, it's preserved ✓
 * If base.anchors is missing/null/array, it defaults to {} ✓
 * 
 * ✓ normalizeV2ProbeResult should preserve anchors correctly
 * 
 * Call 3: Line 5559 in HTTP handler
 *   result = normalizeV2Result(result);
 * 
 * Line 2693 - normalizeV2Result:
 *   return createV2ProbeResult(result);
 *   → 1-arg call
 * 
 * Line 4525 in createV2ProbeResult:
 *   if (arguments.length === 1 && base.anchors !== undefined) {
 *     return {
 *       mode: base.mode || "NONE",
 *       hasQuestion: base.hasQuestion || false,
 *       followupsCount: base.followupsCount || 0,
 *       reason: base.reason || "",
 *       question: base.question,
 *       anchors: base.anchors || {},        ← Uses base.anchors ✓
 *       collectedAnchors: base.collectedAnchors || {}, ← Uses base.collectedAnchors ✓
 *     };
 *   }
 * 
 * ⚠️ CRITICAL: The 1-arg signature check is:
 *   arguments.length === 1 AND base.anchors !== undefined
 * 
 * If result object from normalizeV2ProbeResult has:
 *   result.anchors = {application_outcome: "disqualified"}
 *   → base.anchors !== undefined is TRUE
 *   → Enters 1-arg branch
 *   → Returns { ..., anchors: base.anchors || {} }
 *   → Preserves anchors ✓
 * 
 * If result object has:
 *   result.anchors = {}
 *   → base.anchors !== undefined is TRUE (empty object is defined)
 *   → Returns { ..., anchors: {} }
 *   → Preserves empty anchors ✗
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE 7: ROOT CAUSE ANALYSIS & FORMAL REPORT
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ROOT CAUSE #1: HANDLER RETURNS EMPTY ANCHORS
 * ────────────────────────────────────────────────────────────────────
 * 
 * Evidence Trail:
 * 
 * 1. handlePriorLeAppsPerFieldV2 lines 4223-4260:
 *    - Initializes: anchors = { ...existingCollection }
 *    - existingCollection comes from ctx.collectedAnchors
 *    - ctx.collectedAnchors comes from line 4619: collectedAnchors: incident_context || {}
 *    - incident_context comes from input.incident_context
 *    - Test sends: incident_context: {} (empty for first field)
 *    - Therefore: anchors starts as {}
 * 
 * 2. Line 4228: outcomeNew = inferApplicationOutcomeFromNarrative(narrativeText)
 *    - ✓ Returns "disqualified"
 * 
 * 3. Line 4232: legacyExtraction = extractPriorLeAppsAnchors({ text: narrativeText })
 *    - ✓ Returns { anchors: { application_outcome: "Disqualified" }, ... }
 * 
 * 4. Line 4239: outcome = outcomeNew || legacyExtraction.anchors.application_outcome
 *    - ✓ outcome = "disqualified"
 * 
 * 5. Lines 4251-4254: Merge legacy anchors
 *    - anchors = { ...anchors, ...legacyExtraction.anchors }
 *    - anchors = { ...{}, ...{application_outcome: "Disqualified"} }
 *    - ✓ anchors = {application_outcome: "Disqualified"}
 * 
 * 6. Lines 4257-4260: Set outcome explicitly
 *    - if (outcome) {
 *        anchors = { ...anchors, application_outcome: outcome };
 *      }
 *    - anchors = { ...{app_out: "Disq"}, application_outcome: "disqualified" }
 *    - ⚠️ Now has BOTH "Disqualified" AND "disqualified"?
 *    - Actually no - spread will merge, so final value is "disqualified" ✓
 * 
 * 7. Line 4274: createV2ProbeResult(baseResult, anchors, collectedAnchorsResult)
 *    - baseResult has NO anchors property
 *    - anchors = {application_outcome: "disqualified"}
 *    - 3-arg signature should create result with these anchors ✓
 * 
 * 8. ⚠️ BUT WAIT - Line 4263:
 *    const baseResult = {
 *      mode: "NEXT_FIELD",
 *      hasQuestion: false,
 *      followupsCount: 0,
 *      reason: outcome ? "..." : "...",
 *    };
 *    → baseResult has NO anchors property ✓
 * 
 * 9. createV2ProbeResult checks at line 4525:
 *    if (arguments.length === 1 && base.anchors !== undefined)
 *    → arguments.length = 3
 *    → Condition is FALSE
 *    → Falls through to 3-arg handler at line 4538
 * 
 * 10. Line 4538-4542:
 *     return {
 *       ...base,                       ← Spreads baseResult (no anchors)
 *       anchors: anchors || {},        ← Uses arg 2 ✓
 *       collectedAnchors: collectedAnchors || {}, ← Uses arg 3 ✓
 *     };
 *     → Should return {mode, hasQuestion, anchors: {app_out}, collectedAnchors}
 * 
 * ✓ createV2ProbeResult SHOULD work correctly
 * 
 * ⚠️ UNLESS...
 * 
 * LINE 4495 ALTERNATIVE PATH (non-Q01 fields):
 * For fields OTHER than PACK_PRLE_Q01:
 *   return createV2ProbeResult({
 *     mode: "NEXT_FIELD",
 *     pack_id,
 *     field_key,
 *     semanticField: "narrative",
 *     ...
 *     anchors,                        ← INSIDE base object!
 *     collectedAnchors: anchors       ← INSIDE base object!
 *   });
 * 
 * This is a 1-arg call where base CONTAINS anchors/collectedAnchors!
 * 
 * Line 4525 check:
 *   if (arguments.length === 1 && base.anchors !== undefined)
 *   → arguments.length = 1 ✓
 *   → base.anchors !== undefined ✓ (it's IN the base object)
 *   → Enters 1-arg branch
 *   → Returns base.anchors ✓
 * 
 * ✓ This path also works correctly
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * ROOT CAUSE #2: HANDLER NOT BEING CALLED AT ALL
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * CRITICAL OBSERVATION:
 * 
 * Line 4596: Check if packConfig.perFieldHandler exists
 * 
 * But where is PACK_CONFIG["PACK_PRIOR_LE_APPS_STANDARD"] defined?
 * 
 * Lines 2403-2638: PACK_PRIOR_LE_APPS_STANDARD config
 *   Line 2410: perFieldHandler: handlePriorLeAppsPerFieldV2,
 *   ✓ Handler IS registered
 * 
 * ✓ Router should find and call handler
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * ROOT CAUSE #3: DUAL EXECUTION PATH COLLISION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * CRITICAL DISCOVERY - TWO COMPETING EXECUTION PATHS:
 * 
 * PATH A: perFieldHandler router (lines 4596-4778)
 *   - Executes when packConfig.perFieldHandler exists
 *   - Calls handlePriorLeAppsPerFieldV2
 *   - Injects extractPriorLeAppsOutcomeAnchors
 *   - Merges FactAnchorEngine
 *   - Returns at line 4778
 *   - ✓ Should include anchors
 * 
 * PATH B: Early router (lines 4800-4935)
 *   - Line 4796: hasPerFieldHandler = packConfig?.perFieldHandler && ...
 *   - Line 4798-4799: IF hasPerFieldHandler, log SKIP message
 *   - ⚠️ But then...
 *   - Line 4815: IF !hasPerFieldHandler && pack_id === "PACK_PRIOR..." ...
 *   - Condition: NOT hasPerFieldHandler
 *   - ✓ This path should NOT execute when handler exists
 * 
 * ⚠️ BUT THERE'S A SECOND early router check at line 4815!
 * 
 * Line 4815:
 *   if (!hasPerFieldHandler && pack_id === "PACK_PRIOR_LE_APPS_STANDARD" && 
 *       field_key === "PACK_PRLE_Q01" && narrativeText && narrativeText.trim())
 * 
 * If hasPerFieldHandler === TRUE:
 *   → Condition is FALSE
 *   → Early router does NOT execute
 *   → Code falls through to line 4936+ (Universal MVP logic)
 *   → ⚠️ Universal MVP logic has NO special handling for PACK_PRIOR_LE_APPS!
 * 
 * ⚠️ SMOKING GUN: Path A returns at line 4778, preventing ANY code after from running
 * 
 * Let me trace what happens AFTER line 4778 return...
 * 
 * Line 4778: return handlerResult;
 *   → This is INSIDE the if (packConfig?.perFieldHandler) block
 *   → This returns from probeEngineV2Core function
 *   → Control goes back to probeEngineV2 at line 5426
 * 
 * Line 5426: const rawResult = await probeEngineV2Core(input, base44);
 *   → rawResult = handlerResult from line 4778
 * 
 * Line 5427: return normalizeV2ProbeResult(rawResult);
 *   → Normalizes and returns
 * 
 * ✓ This path is clean - no double processing
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * ROOT CAUSE #4: LOGGING VS ACTUAL RETURN VALUE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * CRITICAL INSIGHT:
 * 
 * The diagnostic logs show anchors are being extracted:
 * - Line 4260: console.log shows anchors = {application_outcome: "disqualified"}
 * - Line 4279-4284: console.log shows finalResult.anchors
 * 
 * But the TEST receives: anchors = {}
 * 
 * ⚠️ This means anchors are LOST somewhere between:
 *   - finalResult creation (line 4274)
 *   - AND test receipt
 * 
 * Possibilities:
 * 1. finalResult is being created incorrectly
 * 2. finalResult is being mutated after creation
 * 3. finalResult is being replaced with a different object
 * 4. Response serialization strips anchors
 * 5. normalizeV2ProbeResult/normalizeV2Result strip anchors
 * 
 * Let me check normalizeV2ProbeResult more carefully...
 * 
 * Lines 2739-2758: normalizeV2ProbeResult
 *   const base = rawResult || {};
 *   const anchors = base.anchors && typeof base.anchors === "object" && !Array.isArray(base.anchors)
 *     ? base.anchors
 *     : {};
 *   return {
 *     ...base,
 *     anchors,
 *     collectedAnchors,
 *     ...extra,
 *   };
 * 
 * ⚠️ CRITICAL: The spread order matters!
 * 
 * If base = {mode: "NEXT_FIELD", anchors: {app_out: "disq"}, ...}
 * And we return:
 *   {
 *     ...base,           ← Spreads ALL properties including anchors
 *     anchors,           ← Overwrites anchors with normalized version
 *     collectedAnchors,  ← Overwrites collectedAnchors with normalized
 *   }
 * 
 * Since anchors variable is created from base.anchors, they should be the same ✓
 * 
 * ✓ normalizeV2ProbeResult should preserve anchors
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * ROOT CAUSE #5: ACTUAL BUG - createV2ProbeResult 3-ARG SIGNATURE ISSUE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * WAIT - Let me re-read createV2ProbeResult more carefully...
 * 
 * Line 4523-4543: createV2ProbeResult function
 * 
 * function createV2ProbeResult(base, anchors, collectedAnchors) {
 *   // Allow single-argument call for backward compatibility
 *   if (arguments.length === 1 && base.anchors !== undefined) {
 *     return {
 *       mode: base.mode || "NONE",
 *       hasQuestion: base.hasQuestion || false,
 *       followupsCount: base.followupsCount || 0,
 *       reason: base.reason || "",
 *       question: base.question,
 *       anchors: base.anchors || {},
 *       collectedAnchors: base.collectedAnchors || {},
 *     };
 *   }
 *   
 *   // Standard three-argument call
 *   return {
 *     ...base,
 *     anchors: anchors || {},
 *     collectedAnchors: collectedAnchors || {},
 *   };
 * }
 * 
 * For 3-arg call from line 4274:
 *   createV2ProbeResult(baseResult, anchors, collectedAnchorsResult)
 * 
 * baseResult = {
 *   mode: "NEXT_FIELD",
 *   hasQuestion: false,
 *   followupsCount: 0,
 *   reason: "...",
 * }
 * 
 * arguments.length = 3
 * base.anchors = undefined (not in baseResult)
 * 
 * Condition check:
 *   arguments.length === 1 → FALSE (it's 3)
 *   → Skip 1-arg branch
 *   → Execute 3-arg branch at line 4538
 * 
 * return {
 *   ...base,                          ← {mode, hasQuestion, followupsCount, reason}
 *   anchors: anchors || {},           ← {application_outcome: "disqualified"}
 *   collectedAnchors: collectedAnchors || {}, ← same
 * };
 * 
 * ✓ Should return correct object with anchors!
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * ACTUAL ROOT CAUSE: CONDITIONAL BRANCH NOT TAKEN
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ⚠️ EUREKA MOMENT:
 * 
 * Look at line 4219 in handlePriorLeAppsPerFieldV2:
 * 
 *   if (fieldKey === "PACK_PRLE_Q01") {
 *     // ... all the extraction logic ...
 *     return finalResult;  ← Line 4286
 *   }
 * 
 *   // Other fields: pass through
 *   console.log(...);  ← Line 4290
 *   return createV2ProbeResult(baseResult, {}, existingCollection);  ← Line 4299
 * 
 * The Q01 branch returns at line 4286.
 * The passthrough branch returns at line 4299.
 * 
 * ⚠️ CRITICAL QUESTION: Is the fieldKey check matching?
 * 
 * Test sends: field_key: "PACK_PRLE_Q01"
 * Handler checks: if (fieldKey === "PACK_PRLE_Q01")
 * ctx.fieldKey = field_key from input (line 4610)
 * 
 * Line 4610: fieldKey: field_key,
 *   → fieldKey = "PACK_PRLE_Q01" ✓
 * 
 * Line 4219: if (fieldKey === "PACK_PRLE_Q01")
 *   → "PACK_PRLE_Q01" === "PACK_PRLE_Q01"
 *   → TRUE ✓
 *   → Should enter Q01 branch ✓
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * HYPOTHESIS 6: LOGGING SHOWS SUCCESS BUT RETURN STATEMENT BROKEN
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Lines 4278-4284 in handlePriorLeAppsPerFieldV2:
 * 
 *   console.log(DEBUG_PREFIX, "[BEFORE_RETURN]", {
 *     mode: finalResult.mode,
 *     hasQuestion: finalResult.hasQuestion,
 *     anchorsKeys: Object.keys(finalResult.anchors || {}),
 *     anchors: finalResult.anchors,
 *     collectedAnchorsKeys: Object.keys(finalResult.collectedAnchors || {}),
 *     collectedAnchors: finalResult.collectedAnchors,
 *     applicationOutcome: finalResult.anchors?.application_outcome || '(missing)',
 *   });
 * 
 * Line 4286:
 *   return finalResult;
 * 
 * ⚠️ If logs show anchors are present but test receives empty anchors,
 * then SOMETHING between line 4286 and the test is stripping them.
 * 
 * Trace from line 4286 return:
 *   ↓
 * Line 4640: handlerResult = await packConfig.perFieldHandler(ctx);
 *   → handlerResult = finalResult
 *   ↓
 * Lines 4642-4687: Surgical injection
 *   → Merges more anchors into handlerResult
 *   → handlerResult.anchors is MUTATED
 *   ↓
 * Lines 4713-4750: FactAnchorEngine merge
 *   → handlerResult.anchors is MUTATED again
 *   ↓
 * Line 4778: return handlerResult;
 *   → Returns from probeEngineV2Core
 *   ↓
 * Line 5426-5427: normalizeV2ProbeResult
 *   → Should preserve handlerResult.anchors
 *   ↓
 * Line 5559: normalizeV2Result
 *   → Calls createV2ProbeResult with 1-arg
 *   → Should preserve result.anchors
 *   ↓
 * Line 5601: Response.json(result)
 * 
 * ⚠️ There are TWO normalization steps: 5427 AND 5559!
 * 
 * This could cause:
 * - Double normalization
 * - Object recreation losing properties
 * - Spread order issues
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * ROOT CAUSE IDENTIFIED: MUTATION RACE CONDITION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ⚠️ THE ACTUAL BUG:
 * 
 * Lines 4657-4665 in surgical injection:
 * 
 *   if (!handlerResult.anchors || typeof handlerResult.anchors !== "object") {
 *     handlerResult.anchors = {};
 *   }
 * 
 * This resets handlerResult.anchors to {} if:
 *   - It doesn't exist
 *   - OR it's not an object
 * 
 * Line 4274 creates finalResult with:
 *   anchors: anchors || {}  ← This IS an object ✓
 * 
 * So the reset should NOT happen...
 * 
 * ⚠️ UNLESS handlerResult and finalResult are DIFFERENT objects!
 * 
 * Wait - let me check the actual return...
 * 
 * Line 4286 in handlePriorLeAppsPerFieldV2:
 *   return finalResult;
 * 
 * Line 4640 in probeEngineV2Core:
 *   handlerResult = await packConfig.perFieldHandler(ctx);
 * 
 * ✓ handlerResult = finalResult (same object reference)
 * 
 * So when line 4658 checks:
 *   if (!handlerResult.anchors || typeof handlerResult.anchors !== "object")
 * 
 * handlerResult.anchors should be the object created at line 4274 ✓
 * typeof handlerResult.anchors should be "object" ✓
 * Condition should be FALSE ✓
 * Should NOT reset to {} ✓
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * FINAL ROOT CAUSE: INCORRECT ANCHOR KEY NORMALIZATION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ⚠️ THE REAL BUG - SPREAD ORDER IN LINE 4667:
 * 
 *   handlerResult.anchors = {
 *     ...outcomeAnchors,          ← NEW extraction: {app_out: "disq"}
 *     ...handlerResult.anchors,   ← EXISTING: {app_out: "disq", prior_le_agency, ...}
 *   };
 * 
 * If handlerResult.anchors already contains {application_outcome: "disqualified"},
 * and outcomeAnchors contains {application_outcome: "disqualified"},
 * then the merge is redundant but harmless.
 * 
 * ✓ Merge order is actually SAFE for this specific case
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️⚠️⚠️ ACTUAL ROOT CAUSE FOUND ⚠️⚠️⚠️
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * The bug is NOT in the extraction logic.
 * The bug is NOT in the merge logic.
 * The bug is NOT in createV2ProbeResult.
 * The bug is NOT in the normalization layers.
 * 
 * THE BUG IS: The test is calling probeEngineV2 with previous_probes_count: 0
 * and expecting the FIRST probe to include anchors.
 * 
 * BUT:
 * 
 * Line 4945-5004 in probeEngineV2Core:
 *   if (previous_probes_count === 0 && (!field_value || field_value.trim() === "")) {
 *     // OPENING LOGIC - no field_value yet
 *   }
 * 
 * Test sends:
 *   previous_probes_count: 0
 *   field_value: "(narrative with disqualified)"  ← NOT EMPTY!
 * 
 * Condition:
 *   previous_probes_count === 0 → TRUE
 *   field_value.trim() === "" → FALSE (has narrative)
 *   Overall: FALSE
 * 
 * → Opening logic does NOT execute ✓
 * → Falls through to line 5006+
 * 
 * Actually wait - the perFieldHandler router at 4596-4778 executes BEFORE
 * the opening logic check at line 4945!
 * 
 * So if handler returns at line 4778, the opening logic never runs.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * COMPREHENSIVE ROOT CAUSE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * After exhaustive analysis, the ONLY way anchors can be empty is if:
 * 
 * 1. handlePriorLeAppsPerFieldV2 is NOT being called (handler registration issue)
 * 2. handlePriorLeAppsPerFieldV2 IS called but fieldKey check fails (typo)
 * 3. createV2ProbeResult is dropping anchors (signature issue)
 * 4. Normalization layers are stripping anchors (data loss)
 * 5. Response serialization corrupts anchors (JSON.stringify issue)
 * 
 * MOST LIKELY: #3 - createV2ProbeResult signature confusion
 * 
 * Re-examining line 4274:
 *   const finalResult = createV2ProbeResult(baseResult, anchors, collectedAnchorsResult);
 * 
 * What if baseResult accidentally has an anchors property set to something?
 * 
 * Line 4263-4272: baseResult definition
 *   const baseResult = {
 *     mode: "NEXT_FIELD",
 *     hasQuestion: false,
 *     followupsCount: 0,
 *     reason: outcome
 *       ? `Field narrative validated; outcome="${outcome}" extracted from narrative`
 *       : "Field narrative validated; outcome not detected (will ask specific outcome question)",
 *   };
 * 
 * ✓ No anchors property in baseResult
 * 
 * Actually, I need to check if there's ANOTHER place where baseResult is defined
 * with anchors...
 * 
 * ⚠️ FOUND IT!!!
 * 
 * Lines 4495-4510: Alternative return path (non-Q01 fields)
 * 
 *   return createV2ProbeResult({
 *     mode: "NEXT_FIELD",
 *     pack_id,
 *     field_key,
 *     semanticField: "narrative",
 *     validationResult: "narrative_complete",
 *     previousProbeCount: previous_probes_count,
 *     maxProbesPerField: 4,
 *     hasQuestion: false,
 *     followupsCount: 0,
 *     reason: "PACK_PRLE_Q01 narrative validated and anchors extracted",
 *     instanceNumber: instance_number,
 *     message: `Extracted ${Object.keys(anchors).length} anchors from narrative`,
 *     anchors,                    ← INSIDE base object!
 *     collectedAnchors: anchors   ← INSIDE base object!
 *   });
 * 
 * This is the NON-Q01 path (line 4290).
 * For Q01, the return is at line 4286, which uses the 3-arg signature.
 * 
 * ✓ Different code paths, both should work
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * CONCLUSION: NO STRUCTURAL BUG FOUND IN CURRENT CODE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * After comprehensive analysis:
 * - All extraction functions work correctly
 * - All merge functions work correctly
 * - createV2ProbeResult works correctly for both 1-arg and 3-arg calls
 * - Normalization layers preserve anchors
 * - Test harness sends correct parameters
 * 
 * ⚠️ THE ONLY REMAINING POSSIBILITY:
 * 
 * The handler is NOT being called at all, and the code is taking a different path!
 * 
 * Required diagnostic: Add instrumentation to verify:
 * 1. Does perFieldHandler check at line 4596 find the handler?
 * 2. Does handlePriorLeAppsPerFieldV2 actually execute?
 * 3. Does the fieldKey === "PACK_PRLE_Q01" check pass?
 * 4. What does finalResult contain before return at line 4286?
 * 5. What does handlerResult contain after return at line 4640?
 * 6. What gets logged at the diagnostic checkpoints?
 * 
 * The only way to know is to RUN THE TEST and examine the logs.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  return Response.json({
    report: "See source code comments for comprehensive forensic audit",
    timestamp: new Date().toISOString(),
    status: "Audit complete - requires runtime log analysis to pinpoint exact failure mode",
    nextSteps: [
      "Run testV2PriorLeAppsAnchors and examine ALL console logs",
      "Verify [TEST_PRIOR_LE_ANCHORS] logs show handler execution",
      "Check if fieldKey === PACK_PRLE_Q01 condition passes",
      "Confirm finalResult.anchors before return at line 4286",
      "Trace handlerResult.anchors through surgical injection and FactEngine merge"
    ]
  });
});