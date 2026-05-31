-- Ensure user_documents rows always get the authenticated user's id
ALTER TABLE user_documents
  ALTER COLUMN user_id SET DEFAULT auth.uid();
