/**
 * Pack Schema Resolver - SINGLE SOURCE OF TRUTH for V2 pack field schema
 * 
 * Enforces DB-first schema for standard cluster packs, prevents static override drift.
 * 
 * SCHEMA OWNERSHIP RULES:
 * 1. V3 packs (ide_version="V3"): Backend owns schema (FactModel)
 * 2. V2 DB-first (is_standard_cluster=true + field_config exists): Database owns schema
 * 3. V2 legacy static: Static config owns schema (fallback)
 */

import { buildV2PackFromDbRow } from "../followups/followupPackConfig";

/**
 * Resolve which schema source to use for a V2 pack
 * 
 * @param {Object} dbPackMeta - Database FollowUpPack record
 * @param {Object} staticConfig - Static FOLLOWUP_PACK_CONFIGS entry
 * @returns {Object} { schemaSource: "db"|"static"|"none", fields: [...], packConfig: {...} }
 */
export function resolvePackSchema(dbPackMeta, staticConfig) {
  const packId = dbPackMeta?.followup_pack_id || staticConfig?.packId;
  
  if (!packId) {
    console.error('[PACK_SCHEMA][ERROR] No packId provided');
    return { schemaSource: "none", fields: [], packConfig: null };
  }
  
  // RULE 1: V3 packs use FactModel (no field schema)
  if (dbPackMeta?.ide_version === "V3") {
    console.log(`[PACK_SCHEMA][V3] ${packId} uses FactModel (no field schema)`);
    return {
      schemaSource: "factmodel",
      fields: [],
      packConfig: staticConfig || {},
      isV3Pack: true
    };
  }
  
  // RULE 2: V2 DB-first (standard cluster with field_config)
  const hasDbFieldConfig = dbPackMeta?.field_config && Array.isArray(dbPackMeta.field_config) && dbPackMeta.field_config.length > 0;
  const isStandardCluster = dbPackMeta?.is_standard_cluster === true;
  
  if (hasDbFieldConfig && isStandardCluster) {
    // DATABASE WINS - ignore static fields even if present
    const merged = buildV2PackFromDbRow(dbPackMeta);
    const dbFields = merged.field_config || [];
    
    // DRIFT WARNING: Log if static has conflicting fields
    const staticFields = staticConfig?.fields || [];
    if (staticFields.length > 0) {
      console.warn(`[PACK_SCHEMA][DRIFT_WARNING] ${packId} has both DB field_config (${dbFields.length}) and static fields (${staticFields.length})`);
      console.warn(`[PACK_SCHEMA][DRIFT_WARNING] Using DB schema - static fields IGNORED`);
      console.warn(`[PACK_SCHEMA][DRIFT_WARNING] To fix: set static config fields: [] for DB-first packs`);
    }
    
    console.log(`[PACK_SCHEMA][DB_FIRST] ${packId} using database schema (${dbFields.length} fields)`);
    
    return {
      schemaSource: "db",
      fields: dbFields,
      packConfig: merged,
      isV2Pack: true
    };
  }
  
  // RULE 3: Legacy static fallback (no DB field_config or not standard cluster)
  const staticFields = staticConfig?.fields || [];
  
  console.log(`[PACK_SCHEMA][STATIC_FALLBACK] ${packId} using static schema (${staticFields.length} fields)`, {
    reason: hasDbFieldConfig ? 'not_standard_cluster' : 'no_db_field_config'
  });
  
  return {
    schemaSource: "static",
    fields: staticFields,
    packConfig: staticConfig || {},
    isV2Pack: true
  };
}

/**
 * Validate schema source matches intent (dev mode warning)
 */
export function validateSchemaSource(packId, schemaSource, dbPackMeta, staticConfig) {
  const isStandardCluster = dbPackMeta?.is_standard_cluster === true;
  const hasDbFieldConfig = dbPackMeta?.field_config && dbPackMeta.field_config.length > 0;
  const hasStaticFields = staticConfig?.fields && staticConfig.fields.length > 0;
  
  // WARNING: Standard cluster pack with static fields override
  if (isStandardCluster && hasDbFieldConfig && hasStaticFields && schemaSource === "static") {
    console.error('[PACK_SCHEMA][VIOLATION]', {
      packId,
      issue: 'STATIC_OVERRIDE_DB',
      isStandardCluster,
      dbFieldCount: dbPackMeta.field_config.length,
      staticFieldCount: staticConfig.fields.length,
      schemaSource,
      expectedSource: 'db',
      action: 'DRIFT_DETECTED - Remove static fields for DB-first packs'
    });
  }
  
  // INFO: Confirm DB-first packs use database
  if (isStandardCluster && hasDbFieldConfig && schemaSource === "db") {
    console.log(`[PACK_SCHEMA][✓] ${packId} correctly using DB schema (${dbPackMeta.field_config.length} fields)`);
  }
}