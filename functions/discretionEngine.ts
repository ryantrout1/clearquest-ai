/**
 * DISCRETION ENGINE
 * Decides IF we need to ask a clarifying question, and HOW much to ask.
 * Stateless - all context passed in each call.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

// Topics that require firm tone
const FIRM_TONE_TOPICS = [
  'integrity',
  'honesty', 
  'misconduct',
  'deception',
  'false_statement',
  'cheating',
  'fraud'
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      collectedAnchors = {},
      stillMissingAnchors = [],
      requiredAnchors = [],
      probeCount = 0,
      maxProbes = 3,
      severity = 'standard',
      topic = 'general',
      nonSubstantiveCount = 0
    } = await req.json();

    // Calculate which required anchors are still missing
    const collectedKeys = Object.keys(collectedAnchors);
    const missingRequired = requiredAnchors.filter(a => !collectedKeys.includes(a));
    const missingCount = stillMissingAnchors.length;

    // Decision logic
    let action = 'stop';
    let targetAnchors = [];
    let tone = 'neutral';
    let reason = '';

    // Rule 1: If all required anchors are collected → stop
    if (missingRequired.length === 0) {
      action = 'stop';
      reason = 'All required anchors collected';
    }
    // Rule 2: If probeCount >= maxProbes → stop
    else if (probeCount >= maxProbes) {
      action = 'stop';
      reason = `Max probes reached (${probeCount}/${maxProbes})`;
    }
    // Rule 3: If severity = "laxed" and only 1 anchor is missing → ask_micro
    else if (severity === 'laxed' && missingCount === 1) {
      action = 'ask_micro';
      targetAnchors = stillMissingAnchors.slice(0, 1);
      reason = 'Laxed severity with 1 missing anchor';
    }
    // Rule 4: If severity = "strict" and multiple anchors are missing → ask_combined
    else if (severity === 'strict' && missingCount > 1) {
      action = 'ask_combined';
      targetAnchors = stillMissingAnchors.slice(0, 3); // Max 3 at a time
      reason = 'Strict severity with multiple missing anchors';
    }
    // Rule 5: If multiple vague answers → prefer ask_micro with soft tone
    else if (nonSubstantiveCount >= 2) {
      action = 'ask_micro';
      targetAnchors = stillMissingAnchors.slice(0, 1);
      tone = 'soft';
      reason = `Multiple vague answers (${nonSubstantiveCount})`;
    }
    // Default: ask for missing anchors based on count
    else if (missingCount > 0) {
      if (missingCount === 1) {
        action = 'ask_micro';
        targetAnchors = stillMissingAnchors;
      } else if (missingCount <= 2) {
        action = 'ask_combined';
        targetAnchors = stillMissingAnchors;
      } else {
        // More than 2 missing - ask combined but limit to 2
        action = 'ask_combined';
        targetAnchors = stillMissingAnchors.slice(0, 2);
      }
      reason = `${missingCount} anchors still missing`;
    }

    // Rule 6: If topic is integrity/honesty/misconduct → tone = firm
    const topicLower = topic.toLowerCase();
    if (FIRM_TONE_TOPICS.some(t => topicLower.includes(t))) {
      tone = 'firm';
    }

    return Response.json({
      success: true,
      action,
      targetAnchors,
      tone,
      reason,
      debug: {
        collectedCount: collectedKeys.length,
        missingCount,
        missingRequired: missingRequired.length,
        probeCount,
        maxProbes,
        severity,
        topic,
        nonSubstantiveCount
      }
    });

  } catch (error) {
    console.error('Discretion Engine error:', error);
    return Response.json({ 
      error: error.message,
      success: false,
      action: 'stop',
      targetAnchors: [],
      tone: 'neutral',
      reason: 'Error occurred'
    }, { status: 500 });
  }
});