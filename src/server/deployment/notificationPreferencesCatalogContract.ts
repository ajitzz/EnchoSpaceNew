// Captured from disposable PostgreSQL after migration039; exact semantic contract.
export const notificationPreferenceColumnContract=[
 {
  "table_name": "conversation_notification_preference_events",
  "column_name": "user_id",
  "type": "integer",
  "not_null": true,
  "default_value": null
 },
 {
  "table_name": "conversation_notification_preference_events",
  "column_name": "request_id",
  "type": "uuid",
  "not_null": true,
  "default_value": null
 },
 {
  "table_name": "conversation_notification_preference_events",
  "column_name": "previous_version",
  "type": "bigint",
  "not_null": true,
  "default_value": null
 },
 {
  "table_name": "conversation_notification_preference_events",
  "column_name": "previous_in_app_alerts",
  "type": "boolean",
  "not_null": false,
  "default_value": null
 },
 {
  "table_name": "conversation_notification_preference_events",
  "column_name": "version",
  "type": "bigint",
  "not_null": true,
  "default_value": null
 },
 {
  "table_name": "conversation_notification_preference_events",
  "column_name": "in_app_alerts",
  "type": "boolean",
  "not_null": true,
  "default_value": null
 },
 {
  "table_name": "conversation_notification_preference_events",
  "column_name": "correlation_id",
  "type": "text",
  "not_null": true,
  "default_value": null
 },
 {
  "table_name": "conversation_notification_preference_events",
  "column_name": "created_at",
  "type": "timestamp with time zone",
  "not_null": true,
  "default_value": "clock_timestamp()"
 },
 {
  "table_name": "conversation_notification_preferences",
  "column_name": "user_id",
  "type": "integer",
  "not_null": true,
  "default_value": null
 },
 {
  "table_name": "conversation_notification_preferences",
  "column_name": "in_app_alerts",
  "type": "boolean",
  "not_null": true,
  "default_value": null
 },
 {
  "table_name": "conversation_notification_preferences",
  "column_name": "version",
  "type": "bigint",
  "not_null": true,
  "default_value": null
 },
 {
  "table_name": "conversation_notification_preferences",
  "column_name": "updated_at",
  "type": "timestamp with time zone",
  "not_null": true,
  "default_value": "clock_timestamp()"
 }
] as const;
export const notificationPreferenceConstraintContract=[
 {
  "table_name": "conversation_notification_preference_events",
  "name": "conversation_notification_preference__previous_version_not_null",
  "definition": "NOT NULL previous_version"
 },
 {
  "table_name": "conversation_notification_preference_events",
  "name": "conversation_notification_preference_ev_correlation_id_not_null",
  "definition": "NOT NULL correlation_id"
 },
 {
  "table_name": "conversation_notification_preference_events",
  "name": "conversation_notification_preference_eve_in_app_alerts_not_null",
  "definition": "NOT NULL in_app_alerts"
 },
 {
  "table_name": "conversation_notification_preference_events",
  "name": "conversation_notification_preference_eve_previous_version_check",
  "definition": "CHECK ((previous_version >= 0))"
 },
 {
  "table_name": "conversation_notification_preference_events",
  "name": "conversation_notification_preference_event_correlation_id_check",
  "definition": "CHECK ((correlation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text))"
 },
 {
  "table_name": "conversation_notification_preference_events",
  "name": "conversation_notification_preference_events_check",
  "definition": "CHECK ((version = (previous_version + 1)))"
 },
 {
  "table_name": "conversation_notification_preference_events",
  "name": "conversation_notification_preference_events_check1",
  "definition": "CHECK (((previous_version = 0) = (previous_in_app_alerts IS NULL)))"
 },
 {
  "table_name": "conversation_notification_preference_events",
  "name": "conversation_notification_preference_events_created_at_not_null",
  "definition": "NOT NULL created_at"
 },
 {
  "table_name": "conversation_notification_preference_events",
  "name": "conversation_notification_preference_events_pkey",
  "definition": "PRIMARY KEY (user_id, request_id)"
 },
 {
  "table_name": "conversation_notification_preference_events",
  "name": "conversation_notification_preference_events_request_id_not_null",
  "definition": "NOT NULL request_id"
 },
 {
  "table_name": "conversation_notification_preference_events",
  "name": "conversation_notification_preference_events_user_id_fkey",
  "definition": "FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT"
 },
 {
  "table_name": "conversation_notification_preference_events",
  "name": "conversation_notification_preference_events_user_id_not_null",
  "definition": "NOT NULL user_id"
 },
 {
  "table_name": "conversation_notification_preference_events",
  "name": "conversation_notification_preference_events_user_id_version_key",
  "definition": "UNIQUE (user_id, version)"
 },
 {
  "table_name": "conversation_notification_preference_events",
  "name": "conversation_notification_preference_events_version_not_null",
  "definition": "NOT NULL version"
 },
 {
  "table_name": "conversation_notification_preferences",
  "name": "conversation_notification_preferences_in_app_alerts_not_null",
  "definition": "NOT NULL in_app_alerts"
 },
 {
  "table_name": "conversation_notification_preferences",
  "name": "conversation_notification_preferences_pkey",
  "definition": "PRIMARY KEY (user_id)"
 },
 {
  "table_name": "conversation_notification_preferences",
  "name": "conversation_notification_preferences_updated_at_not_null",
  "definition": "NOT NULL updated_at"
 },
 {
  "table_name": "conversation_notification_preferences",
  "name": "conversation_notification_preferences_user_id_fkey",
  "definition": "FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT"
 },
 {
  "table_name": "conversation_notification_preferences",
  "name": "conversation_notification_preferences_user_id_not_null",
  "definition": "NOT NULL user_id"
 },
 {
  "table_name": "conversation_notification_preferences",
  "name": "conversation_notification_preferences_version_check",
  "definition": "CHECK ((version > 0))"
 },
 {
  "table_name": "conversation_notification_preferences",
  "name": "conversation_notification_preferences_version_not_null",
  "definition": "NOT NULL version"
 }
] as const;
export const notificationPreferenceIndexContract=[
 {
  "table_name": "conversation_notification_preference_events",
  "name": "conversation_notification_preference_events_pkey",
  "definition": "CREATE UNIQUE INDEX conversation_notification_preference_events_pkey ON public.conversation_notification_preference_events USING btree (user_id, request_id)"
 },
 {
  "table_name": "conversation_notification_preference_events",
  "name": "conversation_notification_preference_events_user_id_version_key",
  "definition": "CREATE UNIQUE INDEX conversation_notification_preference_events_user_id_version_key ON public.conversation_notification_preference_events USING btree (user_id, version)"
 },
 {
  "table_name": "conversation_notification_preferences",
  "name": "conversation_notification_preferences_pkey",
  "definition": "CREATE UNIQUE INDEX conversation_notification_preferences_pkey ON public.conversation_notification_preferences USING btree (user_id)"
 }
] as const;
