# Auction Access Matrix v1

## Guest

- May browse public auctions and auction details.
- Cannot bid.
- Cannot create, end, cancel, or review owner auctions.

## Consumer / Buyer

- May browse public auctions.
- May bid and configure auto-bid on eligible auctions.
- May review personal bids and wins.
- Cannot access `/api/auctions/mine`.
- Cannot create, end, or cancel shop auctions.

## Shop Owner

- May browse all public auctions.
- May access `/api/auctions/mine`.
- Owner auction queries are restricted to auctions belonging to shops owned by the authenticated owner.
- May create an auction only for an item belonging to one of the owner's shops.
- May end or cancel only auctions belonging to one of the owner's shops.
- Cannot place consumer bids using an OWNER account.

## Admin

- May access administrative auction operations.
- May access owner auction controls for platform support and moderation.
- Administrative activity should remain auditable.

## Super Admin

- Uses the protected Super Admin auction-control surface.
- Platform governance and audit actions should be performed from the Super Admin routes.

## Shop Staff

The Staff model currently stores auction permissions such as:

- `auctions:read`
- `auctions:write`

However, operational auction routes currently authenticate the top-level `OWNER` or `ADMIN` role. Staff membership permission enforcement is a separate required implementation before staff accounts can safely manage auctions directly.

## Required controls

- Public Auctions page: discovery, search, shop/category/price filters, status filters, sorting, and view actions.
- Buyer account: bid controls only.
- Owner account: links to My Auctions, Create Auction, and Inventory.
- Owner mutation controls remain on the protected Owner Auctions page.
- Admin and Super Admin controls remain on protected administrative pages.
