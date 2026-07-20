# Shop Staff Auction Workspace v1

## Objective

Allow active shop staff to access auction tools according to
their assigned shop permissions while preserving the user's
top-level account role.

## Capability endpoint

`GET /api/auth/shop-access`

The endpoint returns:

- Top-level account role
- Whether platform access is unrestricted
- Accessible shop IDs
- Effective permission summary
- Per-shop access source
- Staff role and permissions for assigned shops

## Auction workspace rules

- `auctions:read`
  - View assigned-shop auctions
  - Search, filter, sort, and refresh
  - No mutation controls without write permission

- `auctions:write`
  - Create auctions
  - Cancel scheduled or live auctions
  - End auctions
  - Mark or clear reviewed state

- Shop owner
  - Full access to owned shops

- Admin and Super Admin
  - Platform-level access

- Inactive staff
  - No shop access

- Ordinary buyer
  - No shop auction workspace access

## Frontend work remaining

1. Add shop-access service and types.
2. Add asynchronous shop-permission route guard.
3. Permit staff access to `/owner/auctions`.
4. Require write permission for `/owner/auctions/new`.
5. Render read-only versus write-enabled controls.
6. Add permission-aware navigation.
7. Add responsive and accessibility checks.
