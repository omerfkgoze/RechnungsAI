This section covers user journey flows. Part 4 of 6 from ux-design-specification.md.

## User Journey Flows

- Journey 1 Onboarding: goal=zero to first processed invoice in <5 minutes
- Onboarding flow: Landing (Kostenlos starten) then Signup (email+password or Google OAuth, no credit card) then Trust Screen (German flag, Gehostet in Deutschland, GoBD, DSGVO, bank-grade encryption; NOT skippable but concise) then Company Setup (3 fields max: company name, SKR03/04 toggle, optional Steuerberater name; "Spater ergaenzen" visible) then First Invoice Prompt (full-screen camera icon, one action) then Camera (<500ms open time) then AI Processing (3s cascade animation, fields appear top-to-bottom ~800ms) then Aha Moment (all fields+green confidence+SKR+VAT) then Success (GoBD-sicher gespeichert) then nudge for more
- Onboarding metrics: signup to first capture <3min; first capture to approved <30s; Trust Screen drop-off <5%; Company Setup drop-off <10%
- Journey 2 Daily Capture and Review: goal=batch of 5-10 invoices reviewed in <15 minutes
- Capture phase: FAB/icon tap then camera; auto-capture when edges stable >500ms; counter badge increments; camera stays open; swipe down or "Fertig" to switch to dashboard
- Review phase: pipeline dashboard shows stage counts; review queue sorted by confidence (green first then amber then red)
- Green invoice: swipe right <1s, haptic+green flash; Amber: pulse on fields, one-line explanation, tap to see source highlight, correct if needed, 10-30s; Red: action items with guidance, pre-written correction email one-tap, 30-60s
- Returning supplier recognition: shows previous invoice count, auto-assigned SKR code; triggers "it knows me" emotional response
- Undo: 5-second toast with countdown bar after every approve/flag/delete
- Journey 3 DATEV Export: goal=export confirmed invoices to DATEV CSV, send to Steuerberater
- Export flow: Dashboard prompt ("23 Rechnungen bereit") then Export config (auto-suggested period/format/Berater-Nr/Mandanten-Nr from settings; max 1 tap if complete) then Generate (3-step: Validating/Formatting/Packaging, <10s for 500 invoices) then Export Ready (count+0 errors+format) then Download CSV or Email to Steuerberater (auto-subject, professional body, CSV attached)
- Validation warning: never blocks export entirely; allows partial export ("21 von 23 exportiert, 2 uebersprungen")
- Steuerberater email stored in settings; auto-generated subject: "DATEV Export [Month Year] - [Company Name]"
- Journey 4 Error Recovery: goal=correct low-confidence data with minimal friction
- Error types: low confidence amber ("Betrag unclear due to image quality", tap to view source with highlight, correct or confirm, AI learns pattern); missing required data red (manual entry or contact supplier via pre-written email, 3-day reminder); validation failure red (EN 16931 issues listed, correction email to supplier)
- Source document viewer: original image/PDF, relevant area highlighted, pinch-to-zoom, extracted value alongside for comparison, Uebernehmen/Korrigieren buttons
- AI learning feedback: supplier-specific ("Bei naechster Rechnung von Holz-Mueller weiss ich Bescheid") or pattern ("Verstanden, ich merke mir das")
- Journey patterns: (1) Progressive Confidence Escalation (green=zero-friction, amber=one-tap inspection, red=guided action; consistent across all journeys); (2) Always Forward Navigation (never requires going back; missing settings appear inline); (3) Contextual Next Action (system suggests next logical step); (4) Non-Blocking Error Handling (one bad invoice never prevents others)
- Flow optimization: 5-Minute First Value; 2-Second Green Approval; Zero Dead Ends; Inline Over Navigate; Capture Momentum (nothing interrupts camera flow)
