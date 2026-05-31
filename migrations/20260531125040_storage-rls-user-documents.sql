-- Enable authenticated uploads/downloads for the user-documents bucket
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_documents_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket = 'user-documents'
    AND uploaded_by = (SELECT auth.jwt() ->> 'sub')
  );

CREATE POLICY user_documents_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket = 'user-documents'
    AND uploaded_by = (SELECT auth.jwt() ->> 'sub')
  );

CREATE POLICY user_documents_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket = 'user-documents'
    AND uploaded_by = (SELECT auth.jwt() ->> 'sub')
  )
  WITH CHECK (
    bucket = 'user-documents'
    AND uploaded_by = (SELECT auth.jwt() ->> 'sub')
  );

CREATE POLICY user_documents_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket = 'user-documents'
    AND uploaded_by = (SELECT auth.jwt() ->> 'sub')
  );

GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
