# Project Instructions

## Architecture & User Roles
- The platform follows a unified account model similar to Airbnb or Booking.com. 
- A single account can function as both a **Guest** (booking spaces) and a **Host** (listing spaces).
- **Admin**: Admins have access to the Admin Dashboard where they can manage all properties, users, and bookings.

## Feature Implementation Rule
Whenever adding a new feature or field to a property (for example, adding a "video" option, adding "amenities", or configuring a new detail):
- **You MUST update all 3 areas of the app**:
   1. **Property Detailing / View Page**: Implement the display of the feature for the end-user.
   2. **Host Creation / Edit Form**: Allow hosts to input, configure, or upload this new feature when managing their listing.
   3. **Admin Dashboard**: Update the admin panels to allow administrators to moderate, edit, or manage this specific feature on user listings.

## Database
- Connects to Neon Postgres. Always ensure `DATABASE_URL` is parsed securely, ignoring dummy strings and stripping sslmode if reconnecting in script tests, but using the user-provided DB url securely in the `server.ts`. 
- Ensure proper fallback logic is maintained.

## Empty/Placeholder Content
- Avoid sending any empty, placeholder, or default messages such as 'Replace this sample message' to customers via chatbot flows or UI tooltips. Only valid, intentional messages must be sent.
