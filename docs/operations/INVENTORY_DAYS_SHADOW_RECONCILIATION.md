# Inventory Days & Legacy Calendar Blocks: Shadow / Reconciliation Boundary

## 1. Architectural Authority
- Under Milestone 4, **canonical inventory authority** resides exclusively in:
  - `room_types.id` (Authoritative room identity)
  - `inventory_days` (Master physical daily unit capacity ledger: `total_units`, `held_units`, `booked_units`, `blocked_units`)
  - `booking_holds` and `booking_hold_nights` (Active atomic checkout reservation sessions)
- Legacy tables:
  - `room_calendar_blocks` remains **legacy read/input only**.
  - No M4 code may duplicate, overwrite, or physically delete rows in `room_calendar_blocks`.

## 2. Shadow / Reconciliation Boundary
1. **Host-Configured Blocks:** When a host manually creates a date block via the legacy interface, that block acts as legacy input.
2. **Reconciliation Mapping:**
   - Any active record in `room_calendar_blocks` for a given `room_type_id` and date range maps to `blocked_units` in `inventory_days`.
   - `inventory_days` treats `total_available = total_units - (held_units + booked_units + blocked_units)`.
3. **No Overwrites:**
   - The hold acquisition engine does not write into `room_calendar_blocks`.
   - The hold expiration sweeper does not touch `room_calendar_blocks`.
4. **Target Retirement:**
   - In Milestone 15 (Cutover & Legacy Retirement), `room_calendar_blocks` will be decommissioned once all host calendar UIs migrate to managing `inventory_days.blocked_units` directly.
