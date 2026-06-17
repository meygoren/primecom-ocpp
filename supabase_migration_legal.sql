-- Legal module tables

CREATE TABLE IF NOT EXISTS legal_settings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  docusign_access_token text,
  docusign_account_id   text,
  docusign_base_url     text DEFAULT 'https://demo.docusign.net',
  nda_template_id       text,
  counsel_emails        jsonb DEFAULT '[]',
  custom_templates      jsonb DEFAULT '[]',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legal_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  envelope_id     text,
  template_id     text,
  template_name   text,
  recipient_name  text NOT NULL,
  recipient_email text NOT NULL,
  subject         text,
  status          text DEFAULT 'sent',  -- sent | delivered | completed | voided | declined
  sent_at         timestamptz,
  completed_at    timestamptz,
  voided_at       timestamptz,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_documents_created ON legal_documents (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_legal_documents_status  ON legal_documents (status);

CREATE TABLE IF NOT EXISTS legal_notifications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type                text DEFAULT 'alert',  -- alert | document_signed | document_voided | custom
  message             text NOT NULL,
  recipient_email     text,
  related_envelope_id text,
  sent_at             timestamptz,
  is_read             boolean DEFAULT false,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_notifications_created ON legal_notifications (created_at DESC);
