/** Reviewed catalog contract for local migration 038; deliberate changes require re-verification. */
export const serviceCaseConstraintContract=[
  {
    "table_name": "service_case_content_access_receipts",
    "name": "service_case_content_access_receipts_actor_user_id_fkey",
    "definition": "FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT"
  },
  {
    "table_name": "service_case_content_access_receipts",
    "name": "service_case_content_access_receipts_assignment_fence_check",
    "definition": "CHECK ((assignment_fence >= 0))"
  },
  {
    "table_name": "service_case_content_access_receipts",
    "name": "service_case_content_access_receipts_assignment_id_fkey",
    "definition": "FOREIGN KEY (assignment_id) REFERENCES internal_work_assignments(id) ON DELETE RESTRICT"
  },
  {
    "table_name": "service_case_content_access_receipts",
    "name": "service_case_content_access_receipts_assignment_version_check",
    "definition": "CHECK ((assignment_version > 0))"
  },
  {
    "table_name": "service_case_content_access_receipts",
    "name": "service_case_content_access_receipts_before_sequence_check",
    "definition": "CHECK ((before_sequence > 0))"
  },
  {
    "table_name": "service_case_content_access_receipts",
    "name": "service_case_content_access_receipts_case_id_fkey",
    "definition": "FOREIGN KEY (case_id) REFERENCES service_cases(id) ON DELETE RESTRICT"
  },
  {
    "table_name": "service_case_content_access_receipts",
    "name": "service_case_content_access_receipts_check",
    "definition": "CHECK ((expires_at > created_at))"
  },
  {
    "table_name": "service_case_content_access_receipts",
    "name": "service_case_content_access_receipts_correlation_id_check",
    "definition": "CHECK ((correlation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text))"
  },
  {
    "table_name": "service_case_content_access_receipts",
    "name": "service_case_content_access_receipts_limit_count_check",
    "definition": "CHECK (((limit_count >= 1) AND (limit_count <= 100)))"
  },
  {
    "table_name": "service_case_content_access_receipts",
    "name": "service_case_content_access_receipts_membership_id_fkey",
    "definition": "FOREIGN KEY (membership_id) REFERENCES internal_organization_memberships(id) ON DELETE RESTRICT"
  },
  {
    "table_name": "service_case_content_access_receipts",
    "name": "service_case_content_access_receipts_organization_id_fkey",
    "definition": "FOREIGN KEY (organization_id) REFERENCES internal_organizations(id) ON DELETE RESTRICT"
  },
  {
    "table_name": "service_case_content_access_receipts",
    "name": "service_case_content_access_receipts_pkey",
    "definition": "PRIMARY KEY (id)"
  },
  {
    "table_name": "service_case_content_access_receipts",
    "name": "service_case_content_access_receipts_policy_hash_check",
    "definition": "CHECK ((policy_hash ~ '^[a-f0-9]{64}$'::text))"
  },
  {
    "table_name": "service_case_content_access_receipts",
    "name": "service_case_content_access_receipts_session_id_fkey",
    "definition": "FOREIGN KEY (session_id) REFERENCES internal_staff_sessions(id) ON DELETE RESTRICT"
  },
  {
    "table_name": "service_case_content_access_receipts",
    "name": "service_case_content_access_receipts_thread_id_fkey",
    "definition": "FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE RESTRICT"
  },
  {
    "table_name": "service_case_content_access_receipts",
    "name": "service_case_content_access_receipts_through_note_id_check",
    "definition": "CHECK ((through_note_id >= 0))"
  },
  {
    "table_name": "service_case_content_access_receipts",
    "name": "service_case_content_access_receipts_through_sequence_check",
    "definition": "CHECK ((through_sequence >= 0))"
  },
  {
    "table_name": "service_case_events",
    "name": "service_case_events_actor_user_id_fkey",
    "definition": "FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT"
  },
  {
    "table_name": "service_case_events",
    "name": "service_case_events_case_id_fkey",
    "definition": "FOREIGN KEY (case_id) REFERENCES service_cases(id) ON DELETE RESTRICT"
  },
  {
    "table_name": "service_case_events",
    "name": "service_case_events_event_type_check",
    "definition": "CHECK ((event_type = ANY (ARRAY['REQUESTED'::text, 'WITHDRAWN'::text, 'NOTE_ADDED'::text, 'CONTENT_ACCESS_AUTHORIZED'::text])))"
  },
  {
    "table_name": "service_case_events",
    "name": "service_case_events_pkey",
    "definition": "PRIMARY KEY (id)"
  },
  {
    "table_name": "service_case_internal_notes",
    "name": "service_case_internal_notes_assignment_fence_check",
    "definition": "CHECK ((assignment_fence >= 0))"
  },
  {
    "table_name": "service_case_internal_notes",
    "name": "service_case_internal_notes_assignment_id_fkey",
    "definition": "FOREIGN KEY (assignment_id) REFERENCES internal_work_assignments(id) ON DELETE RESTRICT"
  },
  {
    "table_name": "service_case_internal_notes",
    "name": "service_case_internal_notes_assignment_version_check",
    "definition": "CHECK ((assignment_version > 0))"
  },
  {
    "table_name": "service_case_internal_notes",
    "name": "service_case_internal_notes_author_membership_id_fkey",
    "definition": "FOREIGN KEY (author_membership_id) REFERENCES internal_organization_memberships(id) ON DELETE RESTRICT"
  },
  {
    "table_name": "service_case_internal_notes",
    "name": "service_case_internal_notes_author_membership_id_request_id_key",
    "definition": "UNIQUE (author_membership_id, request_id)"
  },
  {
    "table_name": "service_case_internal_notes",
    "name": "service_case_internal_notes_body_check",
    "definition": "CHECK (((length(body) >= 1) AND (length(body) <= 4000)))"
  },
  {
    "table_name": "service_case_internal_notes",
    "name": "service_case_internal_notes_case_id_fkey",
    "definition": "FOREIGN KEY (case_id) REFERENCES service_cases(id) ON DELETE RESTRICT"
  },
  {
    "table_name": "service_case_internal_notes",
    "name": "service_case_internal_notes_command_hash_check",
    "definition": "CHECK ((command_hash ~ '^[a-f0-9]{64}$'::text))"
  },
  {
    "table_name": "service_case_internal_notes",
    "name": "service_case_internal_notes_pkey",
    "definition": "PRIMARY KEY (id)"
  },
  {
    "table_name": "service_case_internal_notes",
    "name": "service_case_internal_notes_policy_hash_check",
    "definition": "CHECK ((policy_hash ~ '^[a-f0-9]{64}$'::text))"
  },
  {
    "table_name": "service_case_internal_notes",
    "name": "service_case_internal_notes_session_id_fkey",
    "definition": "FOREIGN KEY (session_id) REFERENCES internal_staff_sessions(id) ON DELETE RESTRICT"
  },
  {
    "table_name": "service_case_requests",
    "name": "service_case_requests_case_id_fkey",
    "definition": "FOREIGN KEY (case_id) REFERENCES service_cases(id) ON DELETE RESTRICT"
  },
  {
    "table_name": "service_case_requests",
    "name": "service_case_requests_pkey",
    "definition": "PRIMARY KEY (requester_id, request_id)"
  },
  {
    "table_name": "service_case_requests",
    "name": "service_case_requests_request_hash_check",
    "definition": "CHECK ((request_hash ~ '^[a-f0-9]{64}$'::text))"
  },
  {
    "table_name": "service_case_requests",
    "name": "service_case_requests_requester_id_fkey",
    "definition": "FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE RESTRICT"
  },
  {
    "table_name": "service_case_runtime_bindings",
    "name": "service_case_runtime_bindings_disclosure_version_check",
    "definition": "CHECK ((disclosure_version ~ '^[a-z0-9][a-z0-9._:-]{2,99}$'::text))"
  },
  {
    "table_name": "service_case_runtime_bindings",
    "name": "service_case_runtime_bindings_environment_check",
    "definition": "CHECK ((environment = ANY (ARRAY['LOCAL'::text, 'STAGING'::text, 'PRODUCTION'::text])))"
  },
  {
    "table_name": "service_case_runtime_bindings",
    "name": "service_case_runtime_bindings_organization_id_fkey",
    "definition": "FOREIGN KEY (organization_id) REFERENCES internal_organizations(id) ON DELETE RESTRICT"
  },
  {
    "table_name": "service_case_runtime_bindings",
    "name": "service_case_runtime_bindings_pkey",
    "definition": "PRIMARY KEY (role_name)"
  },
  {
    "table_name": "service_case_runtime_bindings",
    "name": "service_case_runtime_bindings_role_kind_check",
    "definition": "CHECK ((role_kind = ANY (ARRAY['CONSUMER'::text, 'STAFF'::text])))"
  },
  {
    "table_name": "service_cases",
    "name": "service_cases_check",
    "definition": "CHECK ((guest_id <> host_id))"
  },
  {
    "table_name": "service_cases",
    "name": "service_cases_check1",
    "definition": "CHECK (((requested_by = guest_id) OR (requested_by = host_id)))"
  },
  {
    "table_name": "service_cases",
    "name": "service_cases_check2",
    "definition": "CHECK (((listing_id IS NULL) <> (experience_id IS NULL)))"
  },
  {
    "table_name": "service_cases",
    "name": "service_cases_check3",
    "definition": "CHECK (((state = 'WITHDRAWN'::text) = ((withdrawn_at IS NOT NULL) AND (withdrawn_by IS NOT NULL))))"
  },
  {
    "table_name": "service_cases",
    "name": "service_cases_environment_check",
    "definition": "CHECK ((environment = ANY (ARRAY['LOCAL'::text, 'STAGING'::text, 'PRODUCTION'::text])))"
  },
  {
    "table_name": "service_cases",
    "name": "service_cases_guest_id_fkey",
    "definition": "FOREIGN KEY (guest_id) REFERENCES users(id) ON DELETE RESTRICT"
  },
  {
    "table_name": "service_cases",
    "name": "service_cases_host_id_fkey",
    "definition": "FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE RESTRICT"
  },
  {
    "table_name": "service_cases",
    "name": "service_cases_id_organization_id_key",
    "definition": "UNIQUE (id, organization_id)"
  },
  {
    "table_name": "service_cases",
    "name": "service_cases_organization_id_fkey",
    "definition": "FOREIGN KEY (organization_id) REFERENCES internal_organizations(id) ON DELETE RESTRICT"
  },
  {
    "table_name": "service_cases",
    "name": "service_cases_pkey",
    "definition": "PRIMARY KEY (id)"
  },
  {
    "table_name": "service_cases",
    "name": "service_cases_requested_by_fkey",
    "definition": "FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE RESTRICT"
  },
  {
    "table_name": "service_cases",
    "name": "service_cases_state_check",
    "definition": "CHECK ((state = ANY (ARRAY['OPEN'::text, 'WITHDRAWN'::text])))"
  },
  {
    "table_name": "service_cases",
    "name": "service_cases_thread_id_fkey",
    "definition": "FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE RESTRICT"
  },
  {
    "table_name": "service_cases",
    "name": "service_cases_version_check",
    "definition": "CHECK ((version > 0))"
  },
  {
    "table_name": "service_cases",
    "name": "service_cases_withdrawn_by_fkey",
    "definition": "FOREIGN KEY (withdrawn_by) REFERENCES users(id) ON DELETE RESTRICT"
  }
] as const;
export const serviceCaseIndexContract=[
  {
    "table_name": "service_case_content_access_receipts",
    "name": "service_case_content_access_receipts_pkey",
    "definition": "CREATE UNIQUE INDEX service_case_content_access_receipts_pkey ON public.service_case_content_access_receipts USING btree (id)"
  },
  {
    "table_name": "service_case_events",
    "name": "service_case_events_pkey",
    "definition": "CREATE UNIQUE INDEX service_case_events_pkey ON public.service_case_events USING btree (id)"
  },
  {
    "table_name": "service_case_internal_notes",
    "name": "service_case_internal_notes_author_membership_id_request_id_key",
    "definition": "CREATE UNIQUE INDEX service_case_internal_notes_author_membership_id_request_id_key ON public.service_case_internal_notes USING btree (author_membership_id, request_id)"
  },
  {
    "table_name": "service_case_internal_notes",
    "name": "service_case_internal_notes_pkey",
    "definition": "CREATE UNIQUE INDEX service_case_internal_notes_pkey ON public.service_case_internal_notes USING btree (id)"
  },
  {
    "table_name": "service_case_internal_notes",
    "name": "service_case_notes_order",
    "definition": "CREATE INDEX service_case_notes_order ON public.service_case_internal_notes USING btree (case_id, id DESC)"
  },
  {
    "table_name": "service_case_requests",
    "name": "service_case_requests_pkey",
    "definition": "CREATE UNIQUE INDEX service_case_requests_pkey ON public.service_case_requests USING btree (requester_id, request_id)"
  },
  {
    "table_name": "service_case_runtime_bindings",
    "name": "service_case_runtime_bindings_pkey",
    "definition": "CREATE UNIQUE INDEX service_case_runtime_bindings_pkey ON public.service_case_runtime_bindings USING btree (role_name)"
  },
  {
    "table_name": "service_cases",
    "name": "service_case_one_open",
    "definition": "CREATE UNIQUE INDEX service_case_one_open ON public.service_cases USING btree (organization_id, environment, thread_id) WHERE (state = 'OPEN'::text)"
  },
  {
    "table_name": "service_cases",
    "name": "service_cases_id_organization_id_key",
    "definition": "CREATE UNIQUE INDEX service_cases_id_organization_id_key ON public.service_cases USING btree (id, organization_id)"
  },
  {
    "table_name": "service_cases",
    "name": "service_cases_pkey",
    "definition": "CREATE UNIQUE INDEX service_cases_pkey ON public.service_cases USING btree (id)"
  }
] as const;
export const serviceCaseColumnContract=[
  {
    "table_name": "service_case_content_access_receipts",
    "column_name": "id",
    "udt_name": "uuid",
    "not_null": true
  },
  {
    "table_name": "service_case_content_access_receipts",
    "column_name": "case_id",
    "udt_name": "uuid",
    "not_null": true
  },
  {
    "table_name": "service_case_content_access_receipts",
    "column_name": "organization_id",
    "udt_name": "uuid",
    "not_null": true
  },
  {
    "table_name": "service_case_content_access_receipts",
    "column_name": "environment",
    "udt_name": "text",
    "not_null": true
  },
  {
    "table_name": "service_case_content_access_receipts",
    "column_name": "thread_id",
    "udt_name": "int4",
    "not_null": true
  },
  {
    "table_name": "service_case_content_access_receipts",
    "column_name": "actor_user_id",
    "udt_name": "int4",
    "not_null": true
  },
  {
    "table_name": "service_case_content_access_receipts",
    "column_name": "membership_id",
    "udt_name": "uuid",
    "not_null": true
  },
  {
    "table_name": "service_case_content_access_receipts",
    "column_name": "session_id",
    "udt_name": "uuid",
    "not_null": true
  },
  {
    "table_name": "service_case_content_access_receipts",
    "column_name": "assignment_id",
    "udt_name": "uuid",
    "not_null": true
  },
  {
    "table_name": "service_case_content_access_receipts",
    "column_name": "assignment_version",
    "udt_name": "int4",
    "not_null": true
  },
  {
    "table_name": "service_case_content_access_receipts",
    "column_name": "assignment_fence",
    "udt_name": "int8",
    "not_null": true
  },
  {
    "table_name": "service_case_content_access_receipts",
    "column_name": "policy_hash",
    "udt_name": "text",
    "not_null": true
  },
  {
    "table_name": "service_case_content_access_receipts",
    "column_name": "before_sequence",
    "udt_name": "int8",
    "not_null": false
  },
  {
    "table_name": "service_case_content_access_receipts",
    "column_name": "through_sequence",
    "udt_name": "int8",
    "not_null": true
  },
  {
    "table_name": "service_case_content_access_receipts",
    "column_name": "through_note_id",
    "udt_name": "int8",
    "not_null": true
  },
  {
    "table_name": "service_case_content_access_receipts",
    "column_name": "limit_count",
    "udt_name": "int4",
    "not_null": true
  },
  {
    "table_name": "service_case_content_access_receipts",
    "column_name": "creation_xid",
    "udt_name": "text",
    "not_null": true
  },
  {
    "table_name": "service_case_content_access_receipts",
    "column_name": "correlation_id",
    "udt_name": "text",
    "not_null": true
  },
  {
    "table_name": "service_case_content_access_receipts",
    "column_name": "created_at",
    "udt_name": "timestamptz",
    "not_null": true
  },
  {
    "table_name": "service_case_content_access_receipts",
    "column_name": "expires_at",
    "udt_name": "timestamptz",
    "not_null": true
  },
  {
    "table_name": "service_case_events",
    "column_name": "id",
    "udt_name": "uuid",
    "not_null": true
  },
  {
    "table_name": "service_case_events",
    "column_name": "case_id",
    "udt_name": "uuid",
    "not_null": true
  },
  {
    "table_name": "service_case_events",
    "column_name": "event_type",
    "udt_name": "text",
    "not_null": true
  },
  {
    "table_name": "service_case_events",
    "column_name": "actor_user_id",
    "udt_name": "int4",
    "not_null": true
  },
  {
    "table_name": "service_case_events",
    "column_name": "evidence_id",
    "udt_name": "uuid",
    "not_null": false
  },
  {
    "table_name": "service_case_events",
    "column_name": "created_at",
    "udt_name": "timestamptz",
    "not_null": true
  },
  {
    "table_name": "service_case_internal_notes",
    "column_name": "id",
    "udt_name": "int8",
    "not_null": true
  },
  {
    "table_name": "service_case_internal_notes",
    "column_name": "case_id",
    "udt_name": "uuid",
    "not_null": true
  },
  {
    "table_name": "service_case_internal_notes",
    "column_name": "author_membership_id",
    "udt_name": "uuid",
    "not_null": true
  },
  {
    "table_name": "service_case_internal_notes",
    "column_name": "session_id",
    "udt_name": "uuid",
    "not_null": true
  },
  {
    "table_name": "service_case_internal_notes",
    "column_name": "assignment_id",
    "udt_name": "uuid",
    "not_null": true
  },
  {
    "table_name": "service_case_internal_notes",
    "column_name": "assignment_version",
    "udt_name": "int4",
    "not_null": true
  },
  {
    "table_name": "service_case_internal_notes",
    "column_name": "assignment_fence",
    "udt_name": "int8",
    "not_null": true
  },
  {
    "table_name": "service_case_internal_notes",
    "column_name": "policy_hash",
    "udt_name": "text",
    "not_null": true
  },
  {
    "table_name": "service_case_internal_notes",
    "column_name": "request_id",
    "udt_name": "uuid",
    "not_null": true
  },
  {
    "table_name": "service_case_internal_notes",
    "column_name": "body",
    "udt_name": "text",
    "not_null": true
  },
  {
    "table_name": "service_case_internal_notes",
    "column_name": "command_hash",
    "udt_name": "text",
    "not_null": true
  },
  {
    "table_name": "service_case_internal_notes",
    "column_name": "created_at",
    "udt_name": "timestamptz",
    "not_null": true
  },
  {
    "table_name": "service_case_requests",
    "column_name": "requester_id",
    "udt_name": "int4",
    "not_null": true
  },
  {
    "table_name": "service_case_requests",
    "column_name": "request_id",
    "udt_name": "uuid",
    "not_null": true
  },
  {
    "table_name": "service_case_requests",
    "column_name": "request_hash",
    "udt_name": "text",
    "not_null": true
  },
  {
    "table_name": "service_case_requests",
    "column_name": "case_id",
    "udt_name": "uuid",
    "not_null": true
  },
  {
    "table_name": "service_case_runtime_bindings",
    "column_name": "role_name",
    "udt_name": "name",
    "not_null": true
  },
  {
    "table_name": "service_case_runtime_bindings",
    "column_name": "role_kind",
    "udt_name": "text",
    "not_null": true
  },
  {
    "table_name": "service_case_runtime_bindings",
    "column_name": "organization_id",
    "udt_name": "uuid",
    "not_null": true
  },
  {
    "table_name": "service_case_runtime_bindings",
    "column_name": "environment",
    "udt_name": "text",
    "not_null": true
  },
  {
    "table_name": "service_case_runtime_bindings",
    "column_name": "disclosure_version",
    "udt_name": "text",
    "not_null": true
  },
  {
    "table_name": "service_cases",
    "column_name": "id",
    "udt_name": "uuid",
    "not_null": true
  },
  {
    "table_name": "service_cases",
    "column_name": "organization_id",
    "udt_name": "uuid",
    "not_null": true
  },
  {
    "table_name": "service_cases",
    "column_name": "environment",
    "udt_name": "text",
    "not_null": true
  },
  {
    "table_name": "service_cases",
    "column_name": "thread_id",
    "udt_name": "int4",
    "not_null": true
  },
  {
    "table_name": "service_cases",
    "column_name": "guest_id",
    "udt_name": "int4",
    "not_null": true
  },
  {
    "table_name": "service_cases",
    "column_name": "host_id",
    "udt_name": "int4",
    "not_null": true
  },
  {
    "table_name": "service_cases",
    "column_name": "listing_id",
    "udt_name": "int4",
    "not_null": false
  },
  {
    "table_name": "service_cases",
    "column_name": "experience_id",
    "udt_name": "int4",
    "not_null": false
  },
  {
    "table_name": "service_cases",
    "column_name": "disclosure_version",
    "udt_name": "text",
    "not_null": true
  },
  {
    "table_name": "service_cases",
    "column_name": "requested_by",
    "udt_name": "int4",
    "not_null": true
  },
  {
    "table_name": "service_cases",
    "column_name": "state",
    "udt_name": "text",
    "not_null": true
  },
  {
    "table_name": "service_cases",
    "column_name": "version",
    "udt_name": "int4",
    "not_null": true
  },
  {
    "table_name": "service_cases",
    "column_name": "created_at",
    "udt_name": "timestamptz",
    "not_null": true
  },
  {
    "table_name": "service_cases",
    "column_name": "withdrawn_at",
    "udt_name": "timestamptz",
    "not_null": false
  },
  {
    "table_name": "service_cases",
    "column_name": "withdrawn_by",
    "udt_name": "int4",
    "not_null": false
  }
] as const;
export const serviceCaseTriggerContract=[
  {
    "table_name": "service_case_content_access_receipts",
    "name": "service_case_history_immutable",
    "function_name": "service_case_immutable",
    "type": 27
  },
  {
    "table_name": "service_case_events",
    "name": "service_case_history_immutable",
    "function_name": "service_case_immutable",
    "type": 27
  },
  {
    "table_name": "service_case_internal_notes",
    "name": "service_case_history_immutable",
    "function_name": "service_case_immutable",
    "type": 27
  },
  {
    "table_name": "service_case_requests",
    "name": "service_case_history_immutable",
    "function_name": "service_case_immutable",
    "type": 27
  },
  {
    "table_name": "service_cases",
    "name": "service_case_transition",
    "function_name": "service_case_guard_transition",
    "type": 27
  }
] as const;
