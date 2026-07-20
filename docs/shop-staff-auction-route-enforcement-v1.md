# Shop Staff Auction Route Enforcement v1

## auctions:read

Allows an active staff member to:

- View auctions for assigned shops
- Use GET /api/auctions/mine
- Review auction status and results
- View settlement and fulfillment summaries where permitted

Does not allow auction mutation.

## auctions:write

Allows an active staff member to:

- Create auctions for assigned-shop inventory
- Cancel assigned-shop auctions
- End assigned-shop auctions
- Mark assigned-shop auctions reviewed
- Clear assigned-shop review state

Requires auctions:read as a companion permission.

## Restrictions

- Staff access is limited to assigned shops.
- Inactive, invited, and archived memberships receive no access.
- Staff cannot access another shop by changing a URL or request body.
- Buyer accounts without an active staff membership remain blocked.
- Shop owners retain full access to their own shops.
- Admin and Super Admin retain platform access.
- Auction bidding remains a buyer function and is not granted by staff auction permissions.

## Route targets

- GET /api/auctions/mine → auctions:read
- POST /api/auctions → auctions:write
- POST /api/auctions/:id/cancel → auctions:write
- POST /api/auctions/:id/end → auctions:write
- PATCH /api/auctions/:id/reviewed → auctions:write
- PATCH /api/auctions/:id/reviewed/clear → auctions:write

The bulk-reviewed route remains owner/admin-only until it accepts an explicit,
validated shop scope.
