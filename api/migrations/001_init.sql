-- ParkLens initial schema

CREATE TYPE permit_type    AS ENUM ('permanent', 'daily');
CREATE TYPE permit_status  AS ENUM ('pending', 'approved', 'rejected', 'revoked');
CREATE TYPE permit_source  AS ENUM ('admin', 'request');
CREATE TYPE gate_direction AS ENUM ('in', 'out');
CREATE TYPE alarm_type     AS ENUM ('unauthorized_entry', 'overstay');
CREATE TYPE alarm_status   AS ENUM ('open', 'resolved');
CREATE TYPE webhook_status AS ENUM ('skipped', 'pending', 'sent', 'failed');

CREATE TABLE admins (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  name          text NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
CREATE UNIQUE INDEX admins_email_key ON admins (lower(email));

CREATE TABLE permits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plate         text NOT NULL,            -- normalized
  plate_display text NOT NULL,
  holder_name   text NOT NULL,
  holder_email  text,
  type          permit_type NOT NULL,
  valid_date    date,
  status        permit_status NOT NULL,
  source        permit_source NOT NULL,
  reference     text UNIQUE,
  public_token  text UNIQUE,
  request_note  text,
  decision_note text,
  decided_at    timestamptz,
  decided_by    uuid REFERENCES admins (id) ON DELETE SET NULL,
  created_by    uuid REFERENCES admins (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT permits_valid_date_chk CHECK (
    (type = 'daily' AND valid_date IS NOT NULL) OR (type = 'permanent' AND valid_date IS NULL)
  )
);
CREATE INDEX permits_plate_status_idx ON permits (plate, status);
CREATE INDEX permits_status_created_idx ON permits (status, created_at);

CREATE TABLE gate_events (
  id          bigserial PRIMARY KEY,
  plate       text NOT NULL,
  plate_raw   text NOT NULL,
  direction   gate_direction NOT NULL,
  occurred_at timestamptz NOT NULL,
  gate_id     text,
  authorized  boolean,                    -- null for 'out'
  permit_id   uuid REFERENCES permits (id) ON DELETE SET NULL,
  session_id  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gate_events_occurred_idx ON gate_events (occurred_at DESC, id DESC);
CREATE INDEX gate_events_plate_idx ON gate_events (plate);

CREATE TABLE parking_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plate          text NOT NULL,
  entered_at     timestamptz NOT NULL,
  exited_at      timestamptz,
  entry_event_id bigint NOT NULL REFERENCES gate_events (id),
  exit_event_id  bigint REFERENCES gate_events (id),
  permit_id      uuid REFERENCES permits (id) ON DELETE SET NULL,
  authorized     boolean NOT NULL,
  closed_reason  text CHECK (closed_reason IN ('exit', 'superseded'))
);
-- at most one open session per plate
CREATE UNIQUE INDEX parking_sessions_open_plate_idx ON parking_sessions (plate) WHERE exited_at IS NULL;
CREATE INDEX parking_sessions_entered_idx ON parking_sessions (entered_at DESC);

ALTER TABLE gate_events
  ADD CONSTRAINT gate_events_session_fk FOREIGN KEY (session_id) REFERENCES parking_sessions (id) ON DELETE SET NULL;

CREATE TABLE alarms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type            alarm_type NOT NULL,
  plate           text NOT NULL,
  status          alarm_status NOT NULL DEFAULT 'open',
  occurred_at     timestamptz NOT NULL,
  gate_id         text,
  gate_event_id   bigint REFERENCES gate_events (id) ON DELETE SET NULL,
  session_id      uuid REFERENCES parking_sessions (id) ON DELETE SET NULL,
  resolved_at     timestamptz,
  resolved_by     uuid REFERENCES admins (id) ON DELETE SET NULL,
  resolution_note text,
  webhook_status  webhook_status NOT NULL DEFAULT 'skipped',
  webhook_error   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX alarms_overstay_session_uniq ON alarms (session_id, type) WHERE type = 'overstay';
CREATE INDEX alarms_status_occurred_idx ON alarms (status, occurred_at DESC);
CREATE INDEX alarms_plate_occurred_idx ON alarms (plate, occurred_at DESC);
CREATE INDEX alarms_session_idx ON alarms (session_id);
CREATE INDEX alarms_gate_event_idx ON alarms (gate_event_id);

CREATE TABLE settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
