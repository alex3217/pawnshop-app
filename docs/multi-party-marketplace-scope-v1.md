# PawnLoop Multi-Party Marketplace Scope V1

## Supported transaction channels

1. Customer to pawn shop
   - Sell item
   - Pawn-loan request
   - Appraisal
   - Shop offers and counteroffers
   - Pickup, drop-off, or shipping
   - Agreement and payment tracking

2. Customer to customer
   - Individual seller listings
   - Fixed price
   - Buy Now
   - Offers and counteroffers
   - Auctions
   - Messaging
   - Shipping or local pickup
   - Payments and seller payouts
   - Ratings, reviews, disputes, and refunds

3. Pawn shop to customer
   - Retail inventory listings
   - Fixed price
   - Offers
   - Auctions
   - Pickup reservations
   - Shipping
   - Checkout and fulfillment
   - Inventory synchronization

4. Pawn shop to pawn shop
   - Verified dealer marketplace
   - Dealer-only listings
   - Wholesale inventory
   - Individual items and inventory lots
   - Private dealer offers
   - Dealer auctions
   - Shop-to-shop purchasing
   - Shipping, pickup, and freight
   - Inventory transfers
   - Transfer documents and invoices
   - Dealer transaction history and ratings

## User roles and capabilities

- Buyer
- Individual Seller
- Pawn Shop Owner
- Shop Staff
- Verified Dealer
- Admin
- Super Admin

A consumer account may buy and sell without maintaining separate accounts.

A verified pawn shop may participate in:
- Retail sales
- Customer appraisal and pawn workflows
- Dealer purchasing
- Dealer sales
- Multi-location transfers

## Listing types

- Fixed price
- Buy Now
- Best Offer
- Auction
- Dealer-only
- Wholesale lot
- Pawn request
- Sell-to-shop request
- Inventory transfer

## Scanner and upload workflow

Scanner intake must support:

- Camera barcode scanning
- UPC
- EAN
- QR codes
- USB and Bluetooth scanners
- Serial numbers
- VIN where applicable
- OCR-assisted intake
- Photos
- Receipts
- Appraisal documents
- Authentication documents
- Duplicate checks
- Serial-number matching
- Suspicious or stolen-item review
- Manual approval before publishing
- Bulk intake
- Inventory-lot creation

After scanning, users must be able to choose:

- Sell to a pawn shop
- Request a pawn loan
- List as an individual seller
- Add to shop inventory
- Publish to the public marketplace
- Create an auction
- Publish to the dealer marketplace
- Transfer to another shop or location

## Shared commerce systems

- Listings
- Offers and counteroffers
- Auctions and bidding
- Buy Now
- Messaging
- Notifications
- Watchlists
- Saved searches
- Payments
- Seller payouts
- Platform fees
- Pickup
- Shipping
- Freight
- Order tracking
- Ratings and reviews
- Refunds
- Disputes
- Moderation
- Prohibited-item controls
- Fraud and risk review
- Seller verification
- Dealer verification
- Transaction history
- Seller dashboards
- Dealer dashboards
- Admin oversight

## Build phases

### Phase 1 — Foundation
- Audit existing database and APIs
- Add marketplace channel enums
- Add individual seller capability
- Add verified dealer capability
- Add common listing and order foundation

### Phase 2 — Customer-to-customer
- Seller listings
- Buy Now
- Offers
- Checkout
- Shipping and pickup
- Seller dashboard
- Ratings and disputes

### Phase 3 — Pawn-shop-to-pawn-shop
- Dealer verification
- Dealer-only listings
- Wholesale lots
- Dealer offers
- Dealer checkout
- Inventory transfers
- Transfer documentation

### Phase 4 — Scanner destinations
- Add workflow selector after scanning
- Create seller listing drafts
- Create dealer listing drafts
- Create transfer drafts
- Add duplicate and restricted-item review

### Phase 5 — Operations
- Messaging
- Notifications
- Payouts
- Refunds
- Disputes
- Ratings
- Admin moderation
- Reporting and analytics
