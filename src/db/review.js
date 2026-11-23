import { provisionAccount } from '../auth/credentials.js';
import { openDatabase } from './index.js';

// Public fixtures for localhost review only; never inserted into the normal database.
const reviewAccounts = [
  { collegeId: 'REVIEW-STUDENT', password: 'ReviewStudent26!', role: 'student', displayName: 'Review Student' },
  { collegeId: 'REVIEW-FACULTY', password: 'ReviewFaculty26!', role: 'faculty', displayName: 'Review Faculty' },
];

export async function openReviewDatabase() {
  const db = openDatabase(':memory:', { includeDemo: false });
  try {
    for (const account of reviewAccounts) await provisionAccount(db, account);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
