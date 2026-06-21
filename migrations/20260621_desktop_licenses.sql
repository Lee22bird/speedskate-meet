create table if not exists desktop_licenses (
  id text primary key,
  license_key text not null unique,
  ssl_skater_id text,
  email text,
  product text not null default 'ssm_desktop',
  status text not null default 'active',
  purchase_source text,
  purchase_date timestamptz,
  activation_count integer not null default 0,
  max_activations integer not null default 2,
  last_activation_at timestamptz,
  last_validation_at timestamptz,
  expires_at timestamptz,
  stripe_customer_id text,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists desktop_licenses_ssl_skater_id_idx on desktop_licenses (ssl_skater_id);
create index if not exists desktop_licenses_email_idx on desktop_licenses (lower(email));
create index if not exists desktop_licenses_status_idx on desktop_licenses (status);
create index if not exists desktop_licenses_product_idx on desktop_licenses (product);
