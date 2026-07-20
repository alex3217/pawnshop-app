# Auction Discovery Controls v2

## Added controls

- Condition filter
- Ending within 24 hours toggle
- Results-per-page selector
- Previous and Next pagination
- Price-range validation
- Buyer Save Search action
- Buyer Watch Item and Unwatch Item actions
- Success and error feedback

## Access rules

### Guest

- May browse and filter auctions.
- Cannot save searches or watch items.

### Buyer

- May save the current auction search.
- May add and remove auction items from the watchlist.
- May browse, filter, and paginate.
- Cannot create, end, or cancel auctions.

### Shop owner

- May browse and filter public auctions.
- Uses the protected owner console for mutations.
- Cannot use buyer Watch or Save Search actions from an owner account.

### Admin and Super Admin

- Continue to use their protected auction-control pages.

## Scaling note

The public discovery service loads up to 100 matching auctions for client-side filtering and pagination. Before the catalog exceeds that threshold, migrate search, category, condition, price, and sorting filters to server-side query parameters.
