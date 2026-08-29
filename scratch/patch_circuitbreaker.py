import re

with open('src/lib/calendarCircuitBreaker.ts', 'r') as f:
    content = f.read()

pattern = r'const isFullyBooked = bookingsRes\.rows\.length > 0;'

new_code = """// CMS Phase C Upgrade: Calculate true inventory across all room types
    const inventoryRes = await pool.query(
      `SELECT SUM(inventory_count) as total_inventory FROM room_types WHERE listing_id = $1`,
      [numListingId]
    );
    const totalInventory = inventoryRes.rows[0]?.total_inventory || 1; // Fallback to 1 for legacy properties

    const isFullyBooked = bookingsRes.rows.length >= totalInventory;"""

content = re.sub(pattern, new_code, content)

with open('src/lib/calendarCircuitBreaker.ts', 'w') as f:
    f.write(content)
print("Patched Circuit Breaker")
