const route = (module, definitions) => definitions.map((definition) => `${module}:${definition}`);

export const MUTATION_POLICY_EXCEPTIONS = Object.freeze({
  public_authentication_flow: route("auth.routes.js", [
    "POST /register", "POST /login", "POST /mfa/challenge", "POST /resend-verification", "POST /forgot-password",
  ]),
  one_time_token_authorized: route("auth.routes.js", ["POST /verify-email", "POST /reset-password"]),
  webhook_signature_authorized: [
    ...route("stripeWebhook.routes.js", ["POST /connect", "POST /"]),
    ...route("integrations.routes.js", ["POST /webhooks/:id"]),
  ],
  authenticated_self_service: [
    ...route("auth.routes.js", ["POST /refresh", "POST /mfa/enrollment", "POST /mfa/enrollment/confirm", "POST /mfa/step-up", "POST /mfa/step-up/verify"]),
    ...route("buyerMessagingProfile.routes.js", ["PATCH /", "DELETE /blocked-shops/:shopId"]),
    ...route("buyerPlans.routes.js", ["PUT /buyer-plans/mine", "PATCH /buyer-plans/mine", "DELETE /buyer-plans/mine", "POST /buyer-plans/mine/cancel-at-period-end", "POST /buyer-plans/mine/resume"]),
    ...route("notifications.routes.js", ["PATCH /:id/read"]),
    ...route("ownerApplications.routes.js", ["PATCH /me", "POST /me/submit", "POST /me/resubmit"]),
    ...route("savedSearches.routes.js", ["POST /", "DELETE /:id"]),
    ...route("training.routes.js", ["PUT /content/:id/progress"]),
    ...route("watchlist.routes.js", ["POST /", "DELETE /:itemId"]),
    ...route("stripe.routes.js", ["POST /payment-methods/setup-session", "POST /payment-methods/:id/default", "DELETE /payment-methods/:id", "POST /billing-portal"]),
  ],
  reviewed_ordinary_business_operation: [
    ...route("ai.routes.js", ["POST /listing-assistant"]),
    ...route("auctions.routes.js", ["PATCH /reviewed/bulk", "PATCH /:id/reviewed", "PATCH /:id/reviewed/clear", "POST /:id/bids", "POST /:id/auto-bid", "POST /", "POST /:id/cancel", "POST /:id/end"]),
    ...route("bids.routes.js", ["PUT /:bidId/archive", "DELETE /:bidId/archive", "POST /:id"]),
    ...route("buyerItemSubmissions.routes.js", ["POST /", "POST /scan", "PATCH /:id/withdraw", "POST /:id/distribute", "PATCH /:id/decline", "PATCH /:id/review", "POST /:id/offers", "PATCH /offers/:offerId/accept", "PATCH /offers/:offerId/reject"]),
    ...route("inquiries.routes.js", ["POST /"]),
    ...route("integrations.routes.js", ["POST /:id/test", "POST /:id/sync"]),
    ...route("inventoryBulk.routes.js", ["POST /import"]),
    ...route("itemIntakes.routes.js", ["PATCH /:id/review", "POST /:id/archive", "POST /:id/publish"]),
    ...route("items.routes.js", ["POST /scan", "POST /:id/sell", "POST /", "PUT /:id", "DELETE /:id", "PATCH /:id/restore"]),
    ...route("marketplaceListings.routes.js", ["POST /", "PATCH /:id", "POST /:id/publish", "POST /:id/pause", "POST /:id/cancel"]),
    ...route("marketplaceTransactions.routes.js", ["POST /reserve", "POST /:id/customer-sell/acknowledge"]),
    ...route("offers.routes.js", ["POST /", "PATCH /:id/accept", "PATCH /:id/reject", "PATCH /:id/counter", "PATCH /:id/accept-counter", "PATCH /:id/decline-counter", "POST /:id/accept", "POST /:id/reject", "POST /:id/counter", "PATCH /:id/cancel", "POST /:id/cancel", "POST /:id/accept-counter", "POST /:id/decline-counter"]),
    ...route("shopConversations.routes.js", ["POST /shop-compose", "POST /", "POST /:id/messages", "PATCH /:id/read", "PATCH /:id/close", "PATCH /:id/reopen", "PATCH /:id/block", "POST /:id/report"]),
    ...route("shops.routes.js", ["PUT /:id/onboarding/complete"]),
    ...route("superAdmin.routes.js", ["POST /plans/seller/:code/impact", "POST /plans/seller/:code/validate-stripe", "POST /growth/leads", "PATCH /growth/leads/:leadId", "DELETE /growth/leads/:leadId", "POST /growth/leads/:leadId/contacts", "PATCH /growth/leads/:leadId/contacts/:contactId", "POST /growth/leads/:leadId/activities", "POST /growth/leads/:leadId/suppress", "POST /growth/leads/:leadId/convert"]),
      ...route("uploads.routes.js", [
        "POST /",
        "POST /bulk",
        "POST /marketplace-listings/:listingId",
        "DELETE /:id",
      ]),
  ],
});

export const CONDITIONAL_MFA_SCOPES = Object.freeze({
  "admin.routes.js:PATCH /owner-applications/:id/status": "privilege.owner-access.review",
  "superAdmin.routes.js:PATCH /shops/:id": "configuration.shop.update",
});
