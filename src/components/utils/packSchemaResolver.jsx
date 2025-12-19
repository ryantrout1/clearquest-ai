/**
 * Pack Schema Resolver - Single Source of Truth for V2 Pack Field Definitions
 * 
 * GOLDEN RULE: Database-first for standard cluster packs (is_standard_cluster=true)
 * Static config only used as fallback for legacy packs
 */

/**
 * Resolve pack schema from database or static config
 * @param {object} dbPackMeta - Pack metadata from FollowUpPack entity
 * @param {object} staticConfig - Static pack config from FOLLOWUP_PACK_CONFIGS
 * @returns {{schemaSource: 'db'|'static', fields: array, packConfig: object}}
 */
export function resolvePackSchema(dbPackMeta, staticConfig) {
  console.log('[PACK_SCHEMA][RESOLVE]', {
    packId: dbPackMeta?.followup_pack_id || staticConfig?.packId,
    hasDb: !!dbPackMeta,
    hasStatic: !!staticConfig,
    isStandardCluster: dbPackMeta?.is_standard_cluster,
    dbFieldCount: dbPackMeta?.field_config?.length || 0,
    staticFieldCount: staticConfig?.fields?.length || 0
  });
  
  // PRIORITY 1: Database field_config (for standard cluster packs)
  if (dbPackMeta?.is_standard_cluster && dbPackMeta?.field_config?.length > 0) {
    console.log('[PACK_SCHEMA][DB_FIRST]', {
      packId: dbPackMeta.followup_pack_id,
      schemaSource: 'db',
      fieldCount: dbPackMeta.field_config.length
    });
    
    return {
      schemaSource: 'db',
      fields: dbPackMeta.field_config,
      packConfig: dbPackMeta
    };
  }
  
  // PRIORITY 2: Static config fallback
  if (staticConfig?.fields?.length > 0) {
    console.log('[PACK_SCHEMA][STATIC_FALLBACK]', {
      packId: staticConfig.packId,
      schemaSource: 'static',
      fieldCount: staticConfig.fields.length
    });
    
    return {
      schemaSource: 'static',
      fields: staticConfig.fields,
      packConfig: staticConfig
    };
  }
  
  // PRIORITY 3: Empty fallback (error case)
  console.error('[PACK_SCHEMA][NO_SCHEMA]', {
    packId: dbPackMeta?.followup_pack_id || staticConfig?.packId,
    reason: 'No field definitions found in database or static config'
  });
  
  return {
    schemaSource: 'none',
    fields: [],
    packConfig: null
  };
}

/**
 * Validate schema source matches pack intent
 * Warns if DB-first pack has static fields (drift risk)
 */
export function validateSchemaSource(packId, schemaSource, dbPackMeta, staticConfig) {
  // Check for drift: DB-first pack with static fields
  if (schemaSource === 'db' && staticConfig?.fields?.length > 0) {
    console.warn('[PACK_SCHEMA][DRIFT_RISK]', {
      packId,
      schemaSource,
      dbFieldCount: dbPackMeta?.field_config?.length || 0,
      staticFieldCount: staticConfig.fields.length,
      reason: 'Static fields exist but DB wins - static config should be empty for DB-first packs'
    });
  }
  
  // Check for missing DB schema when expected
  if (dbPackMeta?.is_standard_cluster && schemaSource !== 'db') {
    console.warn('[PACK_SCHEMA][DB_EXPECTED]', {
      packId,
      schemaSource,
      isStandardCluster: dbPackMeta.is_standard_cluster,
      reason: 'Standard cluster pack should use DB schema but fell back to static'
    });
  }
}