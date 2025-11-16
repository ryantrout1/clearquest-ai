/**
 * Cleanup duplicate questions - keeps only the most recent active version of each question_id
 * Run this once to clean up the database
 */

import { base44 } from '@/api/base44Client';

export async function cleanupDuplicateQuestions() {
  try {
    // Get all questions
    const allQuestions = await base44.entities.Question.list();
    console.log(`Total questions found: ${allQuestions.length}`);
    
    // Group by question_id (accessing nested data property)
    const grouped = {};
    allQuestions.forEach(q => {
      const qid = q.question_id; // Already flattened by base44 SDK
      if (!qid) {
        console.warn('Question without question_id:', q.id);
        return;
      }
      if (!grouped[qid]) {
        grouped[qid] = [];
      }
      grouped[qid].push(q);
    });
    
    // Find duplicates and determine which to delete
    const toDelete = [];
    
    Object.entries(grouped).forEach(([qid, questions]) => {
      if (questions.length > 1) {
        console.log(`Found ${questions.length} copies of question ${qid}`);
        
        // Sort by: active first, then by created_date (newest first)
        questions.sort((a, b) => {
          const aActive = a.active ?? true;
          const bActive = b.active ?? true;
          if (aActive !== bActive) return bActive ? 1 : -1;
          return new Date(b.created_date) - new Date(a.created_date);
        });
        
        // Keep the first one (most recent active), delete the rest
        const [keep, ...duplicates] = questions;
        console.log(`Question ${qid}: Keeping ${keep.id} (active: ${keep.active}), deleting ${duplicates.length} duplicates`);
        toDelete.push(...duplicates.map(d => d.id));
      }
    });
    
    console.log(`Found ${toDelete.length} duplicate questions to permanently delete`);
    
    if (toDelete.length === 0) {
      return {
        success: true,
        deleted: 0,
        summary: 'No duplicate questions found'
      };
    }
    
    // Delete duplicates permanently
    let deleted = 0;
    for (const id of toDelete) {
      try {
        await base44.entities.Question.delete(id);
        deleted++;
      } catch (err) {
        console.error(`Failed to delete question ${id}:`, err);
      }
    }
    
    return {
      success: true,
      deleted,
      summary: `Permanently removed ${deleted} duplicate questions`
    };
    
  } catch (err) {
    console.error('Cleanup error:', err);
    return {
      success: false,
      error: err.message
    };
  }
}