---
version: 1
slug: "src-pages-grouppage-jsx"
primary_target: "src/pages/GroupPage.jsx"
related_targets: ["src/components/ExpenseForm.jsx","src/components/PaymentForm.jsx"]
---

# Group detail page

Mode: Operate. Surface: `/groups/:groupId`. Built code-led (no comp). Scope: this route only; other pages untouched.

## Job and audience
The organizer, usually on a phone after dinner or mid-trip, adds an expense, reads who owes whom, and settles up. Desktop gets a two-column version of the same flow.

## Scope and boundaries
Keep every feature, calculation, validation, route, and the guest versus signed-in distinction. Custom visible components; Ant Design stays only for Drawer/Modal focus handling. Delete/Edit are separated; Ant's default look is an anti-reference.

## Approved additions
"Mark paid" prefills the existing payment form and still goes through the existing validation and over-owed confirmation. Share, export, saved splits, group settings move to the overflow menu. An honest offline indicator only; no queued sync. Person marks are original geometric symbols, not any named textile tradition. Theme follows the device by default.

## Direction contract

THESIS: A calm ledger printed in ink on cloth: hairline rows on one ground instead of cards, a stitched line for each settlement. It refuses the stat-tile dashboard with boxed cards and a table.

OWN-WORLD: Dark is warm indigo ink (#151A2C ground, bone text, turmeric action, madder owes, green owed). Light is bleached cotton (#F3F1EC ground, indigo text). One sans with tabular figures. Hairlines instead of shadows. Each person is an original geometric ink stamp (eight symbols) with a color. Owed and owing are never color alone: sign, label, and bar direction.

STORY: The organizer sees the total and who is square, taps Add, enters amount, payer and split with the thumb, watches the row press into the ledger, then settles each stitched line with one confirmed tap.

FIRST VIEWPORT: Phone: back and overflow header, group name, large total, a row of person stamps, one status line (saved here, or synced, or offline), then the balances strip, with the Add expense and Settle up dock pinned to the bottom. Desktop: ledger left, sticky balances and stitched settle plan on the right; sheets open as a side drawer.

FORM: Operate-mode roll candidate 3 of the grounded list: indigo resist-print cloth lending palette, hairline density, stamps and stitch as the signature move; navigation and controls stay standard. seed:c33cd59675180223

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
