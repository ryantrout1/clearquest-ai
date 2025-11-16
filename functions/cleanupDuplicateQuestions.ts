/**
 * Cleanup duplicate questions - keeps only the most recent active version of each question_id
 * Run this once to clean up the database
 */

import { base44 } from '@/api/base44Client';

export async function cleanupDuplicateQuestions() {
  try {
    // Get all questions
    const allQuestions = await base44.entities.Question.list();
    
    // Group by question_id
    const grouped = {};
    allQuestions.forEach(q => {
      const qid = q.question_id;
      if (!grouped[qid]) {
        grouped[qid] = [];
      }
      grouped[qid].push(q);
    });
    
    // Find duplicates and determine which to delete
    const toDelete = [];
    
    Object.entries(grouped).forEach(([qid, questions]) => {
      if (questions.length > 1) {
        // Sort by: active first, then by created_date (newest first)
        questions.sort((a, b) => {
          if (a.active !== b.active) return b.active ? 1 : -1;
          return new Date(b.created_date) - new Date(a.created_date);
        });
        
        // Keep the first one (most recent active), delete the rest
        const [keep, ...duplicates] = questions;
        console.log(`Question ${qid}: Keeping ${keep.id}, deleting ${duplicates.length} duplicates`);
        toDelete.push(...duplicates.map(d => d.id));
      }
    });
    
    console.log(`Found ${toDelete.length} duplicate questions to delete`);
    
    // Delete duplicates
    for (const id of toDelete) {
      await base44.entities.Question.delete(id);
    }
    
    return {
      success: true,
      deleted: toDelete.length,
      summary: `Cleaned up ${toDelete.length} duplicate questions`
    };
    
  } catch (err) {
    console.error('Cleanup error:', err);
    return {
      success: false,
      error: err.message
    };
  }
}