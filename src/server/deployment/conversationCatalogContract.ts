/** Reviewed PostgreSQL catalog expressions for migration 037; exact comparisons fail closed on drift.
 * Regenerate only after reviewing a deliberate migration/engine compatibility change. */
export const conversationConstraintContract=[
  {
    "table_name": "conversation_read_cursors",
    "name": "conversation_read_cursors_last_read_sequence_check",
    "definition": "CHECK ((last_read_sequence > 0))"
  },
  {
    "table_name": "conversation_read_cursors",
    "name": "conversation_read_cursors_pkey",
    "definition": "PRIMARY KEY (thread_id, user_id)"
  },
  {
    "table_name": "conversation_read_cursors",
    "name": "conversation_read_cursors_thread_id_fkey",
    "definition": "FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE RESTRICT"
  },
  {
    "table_name": "conversation_read_cursors",
    "name": "conversation_read_cursors_user_id_fkey",
    "definition": "FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT"
  },
  {
    "table_name": "messages",
    "name": "conversation_message_sequence_shape",
    "definition": "CHECK (((thread_id IS NULL) = (conversation_sequence IS NULL)))"
  },
  {
    "table_name": "messages",
    "name": "conversation_message_sequence_unique",
    "definition": "UNIQUE (thread_id, conversation_sequence)"
  },
  {
    "table_name": "messages",
    "name": "messages_conversation_sequence_check",
    "definition": "CHECK ((conversation_sequence > 0))"
  },
  {
    "table_name": "messages",
    "name": "messages_notification_intent_id_key",
    "definition": "UNIQUE (notification_intent_id)"
  },
  {
    "table_name": "notification_intent_events",
    "name": "notification_intent_events_actor_id_check",
    "definition": "CHECK ((actor_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'::text))"
  },
  {
    "table_name": "notification_intent_events",
    "name": "notification_intent_events_event_type_check",
    "definition": "CHECK ((event_type = ANY (ARRAY['ENQUEUED'::text, 'CLAIMED'::text, 'LEASE_EXPIRED'::text, 'ATTEMPTS_EXHAUSTED'::text, 'OUTCOME_UNKNOWN'::text, 'SUCCEEDED'::text, 'RETRY_SCHEDULED'::text, 'DEAD_LETTERED'::text, 'MANUAL_REPLAY'::text, 'RECONCILED'::text])))"
  },
  {
    "table_name": "notification_intent_events",
    "name": "notification_intent_events_evidence_check",
    "definition": "CHECK (((jsonb_typeof(evidence) = 'object'::text) AND (octet_length((evidence)::text) <= 4096)))"
  },
  {
    "table_name": "notification_intent_events",
    "name": "notification_intent_events_evidence_check1",
    "definition": "CHECK (((evidence - ARRAY['requestFingerprint'::text, 'fence'::text, 'previousFence'::text, 'attempt'::text, 'classification'::text, 'errorCode'::text, 'delaySeconds'::text, 'receiptId'::text, 'outcome'::text]) = '{}'::jsonb))"
  },
  {
    "table_name": "notification_intent_events",
    "name": "notification_intent_events_outbox_id_fkey",
    "definition": "FOREIGN KEY (outbox_id) REFERENCES notification_intents(id) ON DELETE RESTRICT"
  },
  {
    "table_name": "notification_intent_events",
    "name": "notification_intent_events_pkey",
    "definition": "PRIMARY KEY (id)"
  },
  {
    "table_name": "notification_intent_events",
    "name": "notification_intent_events_reason_check",
    "definition": "CHECK (((length(reason) >= 10) AND (length(reason) <= 2000)))"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_attempts_check",
    "definition": "CHECK ((attempts >= 0))"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_causation_id_check",
    "definition": "CHECK ((causation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text))"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_check",
    "definition": "CHECK ((sender_id <> recipient_id))"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_check1",
    "definition": "CHECK ((partition_key = ('conversation:'::text || (thread_id)::text)))"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_check2",
    "definition": "CHECK ((dedupe_key = ('conversation-message:'::text || (message_id)::text)))"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_check3",
    "definition": "CHECK ((principal_id = ('user:'::text || (sender_id)::text)))"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_check4",
    "definition": "CHECK ((request_fingerprint = conversation_notification_fingerprint(thread_id, message_id, id, sender_id)))"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_check5",
    "definition": "CHECK ((payload = jsonb_build_object('type', 'new_message', 'threadId', thread_id, 'messageId', message_id, 'notificationId', (id)::text)))"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_check6",
    "definition": "CHECK (((state = 'RUNNING'::text) = ((lease_until IS NOT NULL) AND (claimed_by IS NOT NULL))))"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_check7",
    "definition": "CHECK (((state = 'RUNNING'::text) OR ((lease_until IS NULL) AND (claimed_by IS NULL))))"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_check8",
    "definition": "CHECK (((state = 'SUCCEEDED'::text) = (completed_at IS NOT NULL)))"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_claimed_by_check",
    "definition": "CHECK (((length(claimed_by) >= 1) AND (length(claimed_by) <= 160)))"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_correlation_id_check",
    "definition": "CHECK ((correlation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text))"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_dedupe_key_key",
    "definition": "UNIQUE (dedupe_key)"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_execution_class_check",
    "definition": "CHECK ((execution_class = 'LOCAL_EFFECT'::text))"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_fence_check",
    "definition": "CHECK ((fence >= 0))"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_last_error_code_check",
    "definition": "CHECK ((last_error_code ~ '^[A-Z][A-Z0-9_]{0,79}$'::text))"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_max_attempts_check",
    "definition": "CHECK (((max_attempts >= 1) AND (max_attempts <= 100)))"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_message_id_fkey",
    "definition": "FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE RESTRICT"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_message_id_key",
    "definition": "UNIQUE (message_id)"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_message_sequence_check",
    "definition": "CHECK ((message_sequence > 0))"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_organization_id_check",
    "definition": "CHECK ((organization_id IS NULL))"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_pkey",
    "definition": "PRIMARY KEY (id)"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_priority_check",
    "definition": "CHECK (((priority >= 0) AND (priority <= 100)))"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_recipient_id_fkey",
    "definition": "FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE RESTRICT"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_request_fingerprint_check",
    "definition": "CHECK ((request_fingerprint ~ '^[a-f0-9]{64}$'::text))"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_sender_id_fkey",
    "definition": "FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE RESTRICT"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_state_check",
    "definition": "CHECK ((state = ANY (ARRAY['PENDING'::text, 'RUNNING'::text, 'RETRY'::text, 'SUCCEEDED'::text, 'DEAD'::text, 'RECONCILIATION_REQUIRED'::text])))"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_thread_id_fkey",
    "definition": "FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE RESTRICT"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_topic_check",
    "definition": "CHECK ((topic = 'CRM.MESSAGE.NOTIFY'::text))"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_trace_source_check",
    "definition": "CHECK ((trace_source = ANY (ARRAY['REQUEST'::text, 'SYSTEM'::text])))"
  },
  {
    "table_name": "threads",
    "name": "threads_last_message_sequence_check",
    "definition": "CHECK ((last_message_sequence >= 0))"
  }
] as const;
export const conversationIndexContract=[
  {
    "table_name": "conversation_read_cursors",
    "name": "conversation_read_cursors_pkey",
    "definition": "CREATE UNIQUE INDEX conversation_read_cursors_pkey ON public.conversation_read_cursors USING btree (thread_id, user_id)"
  },
  {
    "table_name": "messages",
    "name": "conversation_message_sequence_unique",
    "definition": "CREATE UNIQUE INDEX conversation_message_sequence_unique ON public.messages USING btree (thread_id, conversation_sequence)"
  },
  {
    "table_name": "messages",
    "name": "messages_notification_intent_id_key",
    "definition": "CREATE UNIQUE INDEX messages_notification_intent_id_key ON public.messages USING btree (notification_intent_id)"
  },
  {
    "table_name": "notification_intent_events",
    "name": "notification_event_history",
    "definition": "CREATE INDEX notification_event_history ON public.notification_intent_events USING btree (outbox_id, id)"
  },
  {
    "table_name": "notification_intent_events",
    "name": "notification_intent_events_pkey",
    "definition": "CREATE UNIQUE INDEX notification_intent_events_pkey ON public.notification_intent_events USING btree (id)"
  },
  {
    "table_name": "notification_intent_events",
    "name": "notification_single_enqueue",
    "definition": "CREATE UNIQUE INDEX notification_single_enqueue ON public.notification_intent_events USING btree (outbox_id) WHERE (event_type = 'ENQUEUED'::text)"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_dedupe_key_key",
    "definition": "CREATE UNIQUE INDEX notification_intents_dedupe_key_key ON public.notification_intents USING btree (dedupe_key)"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_leases",
    "definition": "CREATE INDEX notification_intents_leases ON public.notification_intents USING btree (lease_until, id) WHERE (state = 'RUNNING'::text)"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_message_id_key",
    "definition": "CREATE UNIQUE INDEX notification_intents_message_id_key ON public.notification_intents USING btree (message_id)"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_pkey",
    "definition": "CREATE UNIQUE INDEX notification_intents_pkey ON public.notification_intents USING btree (id)"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_ready",
    "definition": "CREATE INDEX notification_intents_ready ON public.notification_intents USING btree (priority DESC, available_at, id) WHERE (state = ANY (ARRAY['PENDING'::text, 'RETRY'::text]))"
  },
  {
    "table_name": "notification_intents",
    "name": "notification_intents_recipient",
    "definition": "CREATE INDEX notification_intents_recipient ON public.notification_intents USING btree (recipient_id, created_at, id)"
  }
] as const;
export const conversationColumnContract=[
  {
    "table_name": "conversation_read_cursors",
    "column_name": "thread_id",
    "udt_name": "int4",
    "not_null": true
  },
  {
    "table_name": "conversation_read_cursors",
    "column_name": "user_id",
    "udt_name": "int4",
    "not_null": true
  },
  {
    "table_name": "conversation_read_cursors",
    "column_name": "last_read_sequence",
    "udt_name": "int8",
    "not_null": true
  },
  {
    "table_name": "conversation_read_cursors",
    "column_name": "acknowledged_at",
    "udt_name": "timestamptz",
    "not_null": true
  },
  {
    "table_name": "messages",
    "column_name": "conversation_sequence",
    "udt_name": "int8",
    "not_null": false
  },
  {
    "table_name": "messages",
    "column_name": "notification_intent_id",
    "udt_name": "uuid",
    "not_null": false
  },
  {
    "table_name": "notification_intent_events",
    "column_name": "id",
    "udt_name": "int8",
    "not_null": true
  },
  {
    "table_name": "notification_intent_events",
    "column_name": "outbox_id",
    "udt_name": "uuid",
    "not_null": true
  },
  {
    "table_name": "notification_intent_events",
    "column_name": "event_type",
    "udt_name": "text",
    "not_null": true
  },
  {
    "table_name": "notification_intent_events",
    "column_name": "actor_id",
    "udt_name": "text",
    "not_null": false
  },
  {
    "table_name": "notification_intent_events",
    "column_name": "reason",
    "udt_name": "text",
    "not_null": false
  },
  {
    "table_name": "notification_intent_events",
    "column_name": "evidence",
    "udt_name": "jsonb",
    "not_null": true
  },
  {
    "table_name": "notification_intent_events",
    "column_name": "created_at",
    "udt_name": "timestamptz",
    "not_null": true
  },
  {
    "table_name": "notification_intents",
    "column_name": "id",
    "udt_name": "uuid",
    "not_null": true
  },
  {
    "table_name": "notification_intents",
    "column_name": "thread_id",
    "udt_name": "int4",
    "not_null": true
  },
  {
    "table_name": "notification_intents",
    "column_name": "message_id",
    "udt_name": "int4",
    "not_null": true
  },
  {
    "table_name": "notification_intents",
    "column_name": "message_sequence",
    "udt_name": "int8",
    "not_null": true
  },
  {
    "table_name": "notification_intents",
    "column_name": "sender_id",
    "udt_name": "int4",
    "not_null": true
  },
  {
    "table_name": "notification_intents",
    "column_name": "recipient_id",
    "udt_name": "int4",
    "not_null": true
  },
  {
    "table_name": "notification_intents",
    "column_name": "topic",
    "udt_name": "text",
    "not_null": true
  },
  {
    "table_name": "notification_intents",
    "column_name": "partition_key",
    "udt_name": "text",
    "not_null": true
  },
  {
    "table_name": "notification_intents",
    "column_name": "dedupe_key",
    "udt_name": "text",
    "not_null": true
  },
  {
    "table_name": "notification_intents",
    "column_name": "request_fingerprint",
    "udt_name": "text",
    "not_null": true
  },
  {
    "table_name": "notification_intents",
    "column_name": "payload",
    "udt_name": "jsonb",
    "not_null": true
  },
  {
    "table_name": "notification_intents",
    "column_name": "execution_class",
    "udt_name": "text",
    "not_null": true
  },
  {
    "table_name": "notification_intents",
    "column_name": "state",
    "udt_name": "text",
    "not_null": true
  },
  {
    "table_name": "notification_intents",
    "column_name": "priority",
    "udt_name": "int4",
    "not_null": true
  },
  {
    "table_name": "notification_intents",
    "column_name": "fence",
    "udt_name": "int8",
    "not_null": true
  },
  {
    "table_name": "notification_intents",
    "column_name": "attempts",
    "udt_name": "int4",
    "not_null": true
  },
  {
    "table_name": "notification_intents",
    "column_name": "max_attempts",
    "udt_name": "int4",
    "not_null": true
  },
  {
    "table_name": "notification_intents",
    "column_name": "lease_until",
    "udt_name": "timestamptz",
    "not_null": false
  },
  {
    "table_name": "notification_intents",
    "column_name": "available_at",
    "udt_name": "timestamptz",
    "not_null": true
  },
  {
    "table_name": "notification_intents",
    "column_name": "claimed_by",
    "udt_name": "text",
    "not_null": false
  },
  {
    "table_name": "notification_intents",
    "column_name": "correlation_id",
    "udt_name": "text",
    "not_null": true
  },
  {
    "table_name": "notification_intents",
    "column_name": "causation_id",
    "udt_name": "text",
    "not_null": false
  },
  {
    "table_name": "notification_intents",
    "column_name": "principal_id",
    "udt_name": "text",
    "not_null": true
  },
  {
    "table_name": "notification_intents",
    "column_name": "organization_id",
    "udt_name": "text",
    "not_null": false
  },
  {
    "table_name": "notification_intents",
    "column_name": "trace_source",
    "udt_name": "text",
    "not_null": true
  },
  {
    "table_name": "notification_intents",
    "column_name": "last_error_code",
    "udt_name": "text",
    "not_null": false
  },
  {
    "table_name": "notification_intents",
    "column_name": "created_at",
    "udt_name": "timestamptz",
    "not_null": true
  },
  {
    "table_name": "notification_intents",
    "column_name": "updated_at",
    "udt_name": "timestamptz",
    "not_null": true
  },
  {
    "table_name": "notification_intents",
    "column_name": "completed_at",
    "udt_name": "timestamptz",
    "not_null": false
  },
  {
    "table_name": "threads",
    "column_name": "last_message_sequence",
    "udt_name": "int8",
    "not_null": true
  }
] as const;
export const conversationRecentIndexContract=[
  {
    "table_name": "threads",
    "name": "conversation_threads_guest_recent",
    "definition": "CREATE INDEX conversation_threads_guest_recent ON public.threads USING btree (guest_id, COALESCE(updated_at, '1970-01-01 00:00:00'::timestamp without time zone) DESC, id DESC)"
  },
  {
    "table_name": "threads",
    "name": "conversation_threads_host_recent",
    "definition": "CREATE INDEX conversation_threads_host_recent ON public.threads USING btree (host_id, COALESCE(updated_at, '1970-01-01 00:00:00'::timestamp without time zone) DESC, id DESC)"
  }
] as const;
