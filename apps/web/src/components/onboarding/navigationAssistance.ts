import type { Step } from "react-joyride";
import type { Role } from "../../services/auth";

export type AssistanceAudience = "GUEST" | Role;

export type AssistanceTopic = {
  id: string;
  title: string;
  summary: string;
  instructions: string[];
  target?: string;
};

export type RouteAssistance = AssistanceTopic & {
  patterns: RegExp[];
};

const topic = (
  id: string,
  title: string,
  summary: string,
  instructions: string[],
): AssistanceTopic => {
  if (!id.trim() || !title.trim()) {
    throw new Error("Assistance topics require an id and title.");
  }

  if (
    instructions.length === 0 ||
    instructions.some((instruction) => !instruction.trim())
  ) {
    throw new Error(`${title} must contain at least one instruction.`);
  }

  return { id, title, summary, instructions };
};

export const CONSUMER_TOPICS: AssistanceTopic[] = [
  topic("buying", "Buying", "Find, compare, and save items from PawnLoop shops.", [
    "Open Marketplace or Item Locator and enter a keyword, category, or nearby location.",
    "Open an item to review its condition, seller, price, availability, and purchase options.",
    "Save the item to your Watchlist or continue to Buy Now when you are ready to check out.",
  ]),
  topic("selling-pawning", "Selling or Pawning", "Submit an item for sale or a pawn request.", [
    "Open Sell / Pawn Item and choose whether you want to sell the item or request a pawn loan.",
    "Describe the item accurately, add identifying details and photos, and provide its condition.",
    "Review your contact and location information, submit the request, then watch for shop responses.",
  ]),
  topic("marketplace-listings", "Marketplace Listings", "Create and manage items you list yourself.", [
    "Open My Listings to review drafts, active listings, and items that need attention.",
    "Choose Create Listing, add a clear title, condition, price, photos, and fulfillment details.",
    "Review the preview before publishing; use Edit from My Listings whenever details change.",
  ]),
  topic("purchases-payments", "Purchases and Payments", "Complete checkout and follow paid orders.", [
    "Choose Buy Now from an eligible item and verify the item, quantity, and seller details.",
    "Confirm delivery or pickup information, then enter payment details in the secure checkout form.",
    "Open My Purchases and select the transaction to track payment, fulfillment, and status updates.",
  ]),
  topic("sales-fulfillment", "Sales and Fulfillment", "Process orders placed on your listings.", [
    "Open Marketplace Sales and select a new order to review the buyer and fulfillment method.",
    "Prepare the exact sold item, then follow the transaction instructions for shipment or pickup.",
    "Update fulfillment promptly and keep the transaction detail page for status and payment records.",
  ]),
  topic("auctions-offers", "Auctions and Offers", "Bid, monitor wins, and negotiate offers.", [
    "Open Auctions or an item page, verify the ending time and terms, then place a bid or offer.",
    "Use My Bids and Offers to monitor activity and respond before an auction or offer expires.",
    "Open My Wins after winning, then follow the item and transaction prompts to complete payment.",
  ]),
];

export const GUEST_TOPICS: AssistanceTopic[] = [
  topic("browse-marketplace", "Browse the Marketplace", "Explore items, auctions, and nearby pawn shops before creating an account.", [
    "Open Marketplace, Shops, Item Locator, or Auctions from the main navigation.",
    "Use search and filters, then open a result to review its details and available actions.",
    "Log in or register when an action requires an account, such as saving, bidding, offering, buying, selling, or pawning.",
  ]),
  topic("guest-account-access", "Account Access", "Log in or register when you are ready to use account features.", [
    "Choose Login if you already have an account, or Register to create one.",
    "Enter the requested account information and follow the page validation messages.",
    "After authentication, use Navigation Assistance again for guidance tailored to your account role.",
  ]),
];

export const ADMIN_TOPICS: AssistanceTopic[] = [
  topic("administration", "Administration", "Use the platform oversight tools available to your account.", [
    "Open the dashboard to review the platform areas available to your administrative role.",
    "Use the workspace menu to select the users, shops, subscriptions, plans, or finance area you need.",
    "Review filters, status, and record details before making an administrative change.",
  ]),
];

export const OWNER_TOPICS: AssistanceTopic[] = [
  topic("owner-setup", "Owner Setup", "Prepare the shop workspace for daily operations.", ["Open Setup Wizard and complete each business requirement in order.", "Add the shop profile and at least one operating location.", "Review the dashboard setup status before adding staff or publishing inventory."]),
  topic("shop-profile", "Shop Profile", "Create the public identity buyers will see.", ["Open Setup Wizard or Create Shop and enter the legal and public business details.", "Add accurate contact information, hours, policies, and a customer-facing description.", "Review the public shop page and correct incomplete information before publishing listings."]),
  topic("inventory", "Inventory", "Create, update, and publish shop items.", ["Open Inventory to search existing stock and identify items needing attention.", "Choose Create Item or Bulk Upload, then enter SKU, condition, pricing, and location details.", "Review the saved item, correct errors, and publish only inventory that is ready for buyers."]),
  topic("scanner", "Scanner", "Use codes to find or create inventory quickly.", ["Open Scan Console and allow camera access, or use a connected scanner or manual code field.", "Scan the barcode, QR code, SKU, or pawn tag once and confirm the detected value.", "Open the matching item, or continue to item creation when no existing record is found."]),
  topic("intake-review", "Item Intake Review", "Evaluate consumer sell and pawn submissions.", ["Open Intake Review and filter for submissions awaiting action.", "Select a request and verify photos, condition, ownership details, and requested transaction type.", "Record the decision or next action and contact the consumer using the approved workflow."]),
  topic("marketplace-listings", "Marketplace Listings", "Publish and maintain sellable inventory.", ["Open My Listings and identify drafts, active listings, and entries needing updates.", "Create or edit a listing with accurate price, condition, photos, and fulfillment terms.", "Preview the buyer-facing listing, publish it, and return here to monitor status."]),
  topic("auctions", "Auctions", "Create and manage timed shop auctions.", ["Open My Auctions to review drafts, active auctions, bids, and completed events.", "Choose Create Auction, select the item, and set opening bid, timing, and terms carefully.", "Review all settings before publishing and monitor bids until the auction closes."]),
  topic("offers", "Offers", "Review and respond to marketplace negotiations.", ["Open Offers and filter for offers awaiting a shop response.", "Review the item, customer amount, expiration, and inventory availability.", "Accept, decline, or counter once, then monitor the resulting status or transaction."]),
  topic("sales-fulfillment", "Sales and Fulfillment", "Move paid marketplace orders to completion.", ["Open Marketplace Sales and select orders requiring fulfillment.", "Verify payment state and the promised pickup or shipping method before releasing inventory.", "Record fulfillment and retain the transaction page for customer and payout follow-up."]),
  topic("finance-payouts", "Finance and Payouts", "Understand balances, fees, and settlement status.", ["Open Finance and choose the relevant date range or transaction group.", "Compare gross sales, fees, refunds, and expected payout amounts.", "Open the underlying transaction when a total differs, and verify payout configuration before escalation."]),
  topic("locations", "Locations", "Maintain shop addresses and operating details.", ["Open Locations and select an existing location or add a new one.", "Enter the complete address, contact details, hours, and location-specific settings.", "Save and verify the location appears correctly anywhere buyers can select pickup or browse shops."]),
  topic("staff-permissions", "Staff and Permissions", "Control who can use shop tools.", ["Open Staff and review every active member and pending invitation.", "Invite the staff member with the minimum role and permissions needed for their work.", "Revisit access after role changes and remove accounts that should no longer enter the workspace."]),
  topic("subscription", "Subscription", "Review plan usage and account limits.", ["Open Subscription to compare the active plan, usage, renewal, and available features.", "Review the effect of any plan change before confirming it.", "Return after the change to verify the displayed plan and limits match your selection."]),
  topic("integrations", "Integrations", "Connect approved external shop services.", ["Open Integrations and choose the service required by your workflow.", "Read the requested permissions, then connect the correct business account.", "Confirm the connection status and run the available test before depending on imported or exported data."]),
];

const route = (
  id: string,
  title: string,
  summary: string,
  patterns: RegExp[],
  instructions: string[],
): RouteAssistance => {
  const assistance = topic(`page-${id}`, title, summary, instructions);
  return { ...assistance, patterns };
};

export const ROUTE_ASSISTANCE: RouteAssistance[] = [
  route("buyer-dashboard", "Buyer Dashboard", "Review the activity that needs your attention.", [/^\/buyer(?:\/dashboard)?\/?$/], ["Review the dashboard summaries for bids, offers, saved items, and nearby inventory.", "Open the relevant card to move to that workflow.", "Return to the dashboard after acting to confirm the updated status."]),
  route("item-locator", "Item Locator", "Find nearby inventory and pawn shops.", [/^\/buyer\/item-locator\/?$/], ["Enter the item you need and allow or enter a search location.", "Adjust distance and filters to narrow the results.", "Open a result to verify current item and shop details before visiting."]),
  route("sell-item", "Sell / Pawn Item", "Send shops a complete item request.", [/^\/buyer\/sell-item\/?$/], ["Choose sell or pawn, then identify and describe the item.", "Add clear photos and accurate condition information.", "Confirm your details, submit, and monitor responses from your account."]),
  route("marketplace", "Marketplace", "Search active listings.", [/^\/marketplace\/?$/], ["Search or browse categories, then apply price, condition, or location filters.", "Compare result cards and open a promising item.", "Verify seller and fulfillment details before saving, offering, bidding, or buying."]),
  route("buy-now", "Buy Now", "Complete checkout for the selected item.", [/^\/marketplace\/buy-now\/?$/], ["Verify the item, seller, price, fees, and fulfillment method.", "Enter or confirm delivery and payment information.", "Submit once, wait for confirmation, then open My Purchases to track the order."]),
  route("shops", "Shop Directory", "Find and evaluate PawnLoop shops.", [/^\/shops\/?$/], ["Search by shop name or location.", "Open a shop to review its profile and available inventory.", "Use the shop's verified contact and hours before planning a visit."]),
  route("shop-detail", "Shop Detail", "Review one shop and its inventory.", [/^\/shops\/[^/]+\/?$/], ["Review the shop address, hours, policies, and contact details.", "Browse the shop's available items and auctions.", "Open an item to confirm availability and transaction options."]),
  route("item-detail", "Item Detail", "Decide what to do with a specific item.", [/^\/items\/[^/]+\/?$/], ["Review all photos, condition notes, seller, and price.", "Check pickup, shipping, offer, or auction terms shown for this item.", "Save it, make an offer, bid, or choose Buy Now only after reviewing the terms."]),
  route("auctions", "Auctions", "Browse and monitor active auctions.", [/^\/auctions\/?$/], ["Filter or browse active auctions and note each closing time.", "Open an auction to read its item condition and bidding terms.", "Place a bid within your limit, then monitor it from My Bids."]),
  route("auction-detail", "Auction Detail", "Bid on one auction with confidence.", [/^\/auctions\/[^/]+\/?$/], ["Review the item, seller, current bid, minimum increment, and end time.", "Enter a bid no higher than your personal limit and confirm it once.", "Check My Bids for changes and My Wins after the auction closes."]),
  route("my-bids", "My Bids", "Track auctions where you have bid.", [/^\/(?:my-bids|bids)\/?$/], ["Review active bids and identify entries where you were outbid.", "Open the auction before bidding again and recheck its end time.", "After closing, use My Wins for successful bids and payment steps."]),
  route("my-wins", "My Wins", "Complete purchases from won auctions.", [/^\/my-wins\/?$/], ["Open the newly won auction and verify the final amount.", "Follow the payment or transaction action provided for the win.", "Track pickup or shipping from its transaction detail page."]),
  route("watchlist", "Watchlist", "Revisit items you saved.", [/^\/watchlist\/?$/], ["Review saved items for price or availability changes.", "Open an item to confirm it is still suitable.", "Remove stale entries or continue with the available purchase, offer, or bid action."]),
  route("saved-searches", "Saved Searches", "Reuse searches and review new matches.", [/^\/saved-searches\/?$/], ["Open a saved search to refresh its current results.", "Adjust the filters when matches are too broad or too narrow.", "Remove searches you no longer need so alerts remain useful."]),
  route("listings-mine", "My Listings", "Manage your marketplace listings.", [/^\/marketplace\/listings\/mine\/?$/], ["Filter listings by draft, active, sold, or attention-needed status.", "Open a listing to verify price, condition, fulfillment, and availability.", "Edit inaccurate entries or create a new listing for another item."]),
  route("listing-new", "Create Listing", "Publish an accurate marketplace listing.", [/^\/marketplace\/listings\/new\/?$/], ["Select or describe the exact item and upload clear photos.", "Set condition, price, quantity, and pickup or shipping terms.", "Review the buyer-facing details, then save a draft or publish."]),
  route("listing-edit", "Edit Listing", "Update a specific marketplace listing.", [/^\/marketplace\/listings\/[^/]+\/edit\/?$/], ["Compare the listing with the physical item and current availability.", "Correct price, condition, photos, or fulfillment details.", "Save, then return to My Listings to verify the updated status."]),
  route("purchases", "My Purchases", "Track marketplace orders you bought.", [/^\/marketplace\/purchases\/?$/], ["Find the order by date, seller, or status.", "Open its transaction to review payment and fulfillment progress.", "Follow only the available transaction actions and keep status details for support."]),
  route("sales", "Marketplace Sales", "Fulfill orders placed on your listings.", [/^\/marketplace\/sales\/?$/], ["Identify paid orders awaiting shipment or pickup.", "Open the transaction and verify the item and fulfillment method.", "Complete the requested handoff steps and record fulfillment promptly."]),
  route("transaction-detail", "Transaction Detail", "Follow one order from payment through fulfillment.", [/^\/marketplace\/transactions\/[^/]+\/?$/], ["Verify the item, buyer or seller, total, payment state, and fulfillment method.", "Complete the next available action without repeating a pending payment or status update.", "Use the status history as the record for pickup, shipping, payout, or support follow-up."]),
  route("offers", "Offers", "Manage item price negotiations.", [/^\/offers\/?$/], ["Filter for offers awaiting your response and open the relevant item.", "Check the amount, expiration, item status, and counterparty before acting.", "Accept, decline, or counter, then monitor the resulting offer or transaction state."]),
  route("owner-dashboard", "Owner Dashboard", "Review shop health and next actions.", [/^\/owner\/?$/, /^\/owner\/dashboard\/?$/], ["Review setup, inventory, transaction, offer, and auction summaries.", "Open the card with an alert or incomplete count.", "Return after acting to confirm the dashboard reflects the change."]),
  route("owner-onboarding", "Owner Setup Wizard", "Complete required shop setup in order.", [/^\/owner\/onboarding\/?$/], ["Start with business and shop identity information.", "Complete location and operating details, saving each section before continuing.", "Review the completion state and resolve missing requirements before publishing inventory."]),
  route("shop-new", "Create Shop", "Add a shop profile to the owner account.", [/^\/owner\/shops\/new\/?$/], ["Enter the shop's public and legal details accurately.", "Add contact, address, hours, and customer-facing information.", "Save and review the resulting shop profile before adding sellable inventory."]),
  route("item-new", "Create Item", "Add one inventory record.", [/^\/owner\/items\/new\/?$/], ["Choose the shop or location and enter a unique SKU or identifying code.", "Add title, category, condition, cost, price, and clear photos.", "Save, review the item record, and publish or list it only when complete."]),
  route("item-edit", "Edit Item", "Correct a specific inventory record.", [/^\/items\/[^/]+\/edit\/?$/], ["Verify you are editing the intended physical item and location.", "Update condition, pricing, identifiers, photos, or availability.", "Save and confirm dependent marketplace listings remain accurate."]),
  route("inventory", "Inventory", "Search and maintain shop stock.", [/^\/owner\/inventory\/?$/], ["Search or filter by location, SKU, status, or category.", "Open an item to verify its details and marketplace readiness.", "Use Create Item or Bulk Upload for new stock and resolve flagged records before publishing."]),
  route("intakes", "Item Intake Review", "Process consumer sell or pawn submissions.", [/^\/owner\/item-intakes\/?$/], ["Filter for new or pending intake requests.", "Open one request and verify its photos, condition, owner details, and requested transaction.", "Record the decision and next action so the consumer receives a clear response."]),
  route("integrations", "Integrations", "Connect and verify external services.", [/^\/owner\/integrations\/?$/], ["Choose the integration and review what information it can access.", "Connect the intended business account and complete authorization.", "Confirm healthy status and test the connection before relying on synchronized data."]),
  route("locations", "Locations", "Maintain shop operating locations.", [/^\/owner\/locations\/?$/], ["Select a location to edit or choose the add-location action.", "Enter address, contact, hours, and location-specific settings.", "Save and verify pickup and public shop information use the correct location."]),
  route("staff", "Staff and Permissions", "Review shop access.", [/^\/owner\/staff\/?$/], ["Review active staff, roles, and pending invitations.", "Invite or edit a member using the least access needed.", "Remove stale access and verify sensitive capabilities are owner-restricted."]),
  route("scanner", "Scan Console", "Locate or create an item from its code.", [/^\/owner\/scan-console\/?$/], ["Allow camera access or focus the manual/scanner input.", "Scan one barcode, QR code, SKU, or pawn tag and verify the result.", "Open the matching inventory record or create a new item when no match exists."]),
  route("bulk-upload", "Bulk Upload", "Import multiple inventory records.", [/^\/owner\/bulk-upload\/?$/], ["Download or follow the required column format and prepare a clean inventory file.", "Upload the file and review every validation error before importing.", "Confirm the import totals, then spot-check the new records in Inventory."]),
  route("subscription", "Subscription", "Review plan, limits, and renewal.", [/^\/owner\/subscription\/?$/], ["Review the active plan, included features, usage, and renewal details.", "Compare any proposed plan change and its effective timing.", "Confirm only when ready, then verify the displayed plan and limits."]),
  route("owner-auctions", "My Auctions", "Manage shop auction activity.", [/^\/owner\/auctions\/?$/], ["Filter drafts, active auctions, and completed results.", "Open an auction to inspect settings and bid activity.", "Create a new auction for eligible inventory or follow through on completed sales."]),
  route("auction-new", "Create Auction", "Configure a timed sale.", [/^\/owner\/auctions\/new\/?$/], ["Select the exact eligible item and confirm its condition and availability.", "Set opening bid, schedule, increments, and fulfillment terms.", "Review all values and publish only when the timing and terms are final."]),
  route("finance", "Finance", "Reconcile transactions and payouts.", [/^\/owner\/finance\/?$/], ["Choose the date range and review sales, fees, refunds, and expected payouts.", "Open any mismatched transaction and compare its payment and fulfillment history.", "Verify payout settings and retain the relevant transaction details for support."]),
];

export function assistanceAudience(role: Role | null): AssistanceAudience {
  return role ?? "GUEST";
}

export function topicsForRole(role: Role | null): AssistanceTopic[] {
  switch (assistanceAudience(role)) {
    case "CONSUMER": return CONSUMER_TOPICS;
    case "OWNER": return OWNER_TOPICS;
    case "ADMIN":
    case "SUPER_ADMIN": return ADMIN_TOPICS;
    case "GUEST": return GUEST_TOPICS;
  }
}

export function helpForPath(pathname: string, role: Role | null = null): RouteAssistance {
  const audience = assistanceAudience(role);
  const canUseMatchedHelp =
    audience === "CONSUMER" ||
    (audience === "OWNER" && !pathname.startsWith("/buyer")) ||
    (audience === "GUEST" && /^(?:\/|\/marketplace(?:\/buy-now)?|\/shops(?:\/[^/]+)?|\/items\/[^/]+|\/auctions(?:\/[^/]+)?)\/?$/.test(pathname));

  if (audience === "ADMIN" || audience === "SUPER_ADMIN") {
    const area = audience === "SUPER_ADMIN" ? "Platform Administration" : "Admin Workspace";
    return route("admin-current", area, "Review and manage the administrative area shown on this page.", [/^$/], [
      "Read the page heading, status summaries, and active filters before selecting a record.",
      "Open the relevant administrative record and verify its identity and current state.",
      "Review the effect of an available action before confirming any change.",
    ]);
  }

  if (canUseMatchedHelp) {
    const matched = ROUTE_ASSISTANCE.find((entry) =>
      entry.patterns.some((pattern) => pattern.test(pathname)),
    );
    if (matched) return matched;
  }

  return route("current", "Page Guidance", "Use the current page safely and efficiently.", [/^$/], ["Read the page heading and any status or validation message first.", "Complete the primary action one section at a time and review entries before submitting.", "Use Navigation Assistance to choose the broader topic related to this page."]);
}

export function joyrideStepsForTopic(selected: AssistanceTopic): Step[] {
  if (
    selected.instructions.length === 0 ||
    selected.instructions.some((instruction) => !instruction.trim())
  ) {
    throw new Error(`${selected.title} does not contain any instructions.`);
  }

  const fallbackTarget = '[data-tour="main-content"]';
  let target = fallbackTarget;

  if (selected.target && typeof document !== "undefined") {
    try {
      if (document.querySelector(selected.target)) target = selected.target;
    } catch {
      target = fallbackTarget;
    }
  }

  return selected.instructions.map((instruction, index) => ({
    target,
    title: `${selected.title}: Step ${index + 1}`,
    content: instruction,
    placement: "top",
  }));
}
