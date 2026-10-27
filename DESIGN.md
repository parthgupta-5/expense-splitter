# Design: Group page

Scope: the route `/groups/:groupId` and the sheets it opens (add or edit expense, record payment, settle up, people, group menu). Other pages still use the original blue Ant Design styling in `src/styles.css` and `src/theme.js` (`buildTheme`). This document describes what shipped in `src/group.css`, `src/components/group/` and `buildGroupTheme`. Product context lives in `PRODUCT.md`; the approved contract is `.impeccable/surfaces/src-pages-grouppage-jsx.md`.

## Thesis

A calm ledger printed in ink on cloth. Rows are hairlines on one ground instead of cards. Each settlement is a stitched (dashed) line between two people. It refuses the stat-tile dashboard with boxed cards and a table.

- Phone first: the organizer logs a cost one-handed, right after dinner.
- The settle-up plan is the payoff, so balances and who-pays-whom stay easy to read.
- Guest first, account optional: sign-in is an upgrade and never blocks adding an expense.

## Theme

The group page follows the device appearance (`data-theme` on `<html>` is `light` or `dark`, set from `prefers-color-scheme`). Tokens are on `:root`, not on `.gp`, because Ant Design sheets and dialogs render in portals.

| Token | Light (bleached cotton) | Dark (warm indigo ink) | Use |
|---|---|---|---|
| `--gp-ground` | `#f3f1ec` | `#151a2c` | page and dock background |
| `--gp-raised` | `#fbfaf7` | `#1d2338` | hover fill, toast, inputs |
| `--gp-ink` | `#1a2140` | `#ede6d6` | text |
| `--gp-ink-2` | `#4a5170` | `#aeb4cc` | secondary text |
| `--gp-line` | `#d5d2c8` | `#313a58` | hairlines, bar track |
| `--gp-line-strong` | `#8c8878` | `#6a76a0` | control borders, bar centre tick |
| `--gp-action` | `#e8a923` | `#e8a923` | turmeric: the one primary action, active tab and nav |
| `--gp-on-action` | `#151a2c` | `#151a2c` | text on turmeric |
| `--gp-owes` | `#a73e29` | `#f08a6e` | madder: money owed by this person |
| `--gp-owed` | `#1f6f49` | `#7cc59d` | green: money owed to this person |
| `--gp-focus` | `#1a2140` | `#f2c14e` | focus ring colour |

Person tones `--gp-t0` to `--gp-t5` (ochre, madder, green, blue, plum, olive) each have a lighter dark-mode value. Do not use the old `#4667e8` blue anywhere on this route.

## Typography

One family: Albert Sans (400 to 700, loaded from Google Fonts in `index.html`), falling back to the system sans. All figures use `font-variant-numeric: tabular-nums` so columns of money align.

| Role | Size and weight |
|---|---|
| Group title (h1) | 28px / 700, tight tracking, wraps with `overflow-wrap: anywhere` |
| Total spent figure | 44px / 600 |
| Section heading (h2) | 20px / 700 |
| Body, buttons, tabs | 16px / 400 to 600 |
| Balance amount | 17px / 600 |
| Secondary text, status | 14px |
| Count badges, balance labels | 13px |

## Layout

Phone (below 960px): back button and overflow menu in the page header, then group name, "Total spent" and figure, a people button with overlapping marks, a currency chip, one status line, then balances, then the Expenses and Payments tabs with the ledger. A fixed dock holds **Add expense** (primary, turmeric) and **Settle up** with a count of suggested payments. The content has bottom padding of 104px plus the safe-area inset, so the last row always clears the dock (checked at 390px: last row bottom 740px, dock top 771px).

Desktop (960px and up): the global top bar is shown. The ledger is on the left. Balances and the stitched settle-up plan sit in a right column. The dock buttons move into the header area. Sheets open as a right-hand drawer instead of a full-height sheet. Content width is `min(100% - 32px, 1120px)`.

## Components

**Person mark.** An original geometric stamp: one of eight symbols (ring, cross, diamond, triangle, bars, dots, chevrons, half-disc) drawn on a 24-unit grid, in a rounded-square outline, in one of six tones. A hash of the name picks the symbol and tone; `assignMarks` resolves collisions inside a group so each person is distinct where possible and keeps the same mark across reloads and list order. The mark is decorative (`aria-hidden`). The name is always written beside it.

**People button and mark stack.** A pill with up to four overlapping marks and "N people". It opens the people sheet. The stack uses the page ground behind each mark so the overlaps read as separate stamps.

**Chips.** Static chips (currency, counts) are 32px pill outlines in the hairline colour. Selectable chips in the expense sheet (Who paid, Split between) show the person mark, the name, and a tick when selected; selected chips fill with `--gp-chip-on` and take a stronger border, so selection is not colour alone. Chip rows wrap onto a second line.

**Balance row.** Mark, name, and a right-aligned figure with a label ("is owed" or "owes") above a signed amount (`+₹787.50` or `−₹412.50`). Below it, a 6px track with a centre tick: owed fills right in green; owes fills left in a diagonal-hatched madder pattern. Direction is carried by the sign, the word, and the bar side, never by colour alone. A person at zero shows no fill. The row is a button that expands detail.

**Settle-up line.** Two person marks joined by a dashed line, then "Chitra pays Asha ₹412.50" and a **Mark paid** button. Mark paid prefills the existing payment form and still passes through the existing validation and the over-owed confirmation. "Record a different payment" is a quiet underlined button.

**Ledger entry.** Title, then "Category · Paid by Name · date", amount right-aligned, separated by hairlines. A new entry plays a short settle animation.

**Sheets.** A shared `Sheet` component on Ant Design's Drawer (kept only for focus trapping and Escape handling). Title, a close button, scrolling body, and a sticky footer with the actions. The expense sheet footer reads "Add expense · ₹1,200.00" so the amount is confirmed at the point of commit. Missing fields are explained inline ("Choose who paid", "Enter the total") and what was typed is kept.

**Status line.** A dot and one sentence: "Saved on this device · only you can see this group · Sign in to share" for guests, a filled green dot when synced, and a bold offline message when the browser is offline. There is no queued sync.

**Toasts.** Ant message restyled with the raised colour, a strong hairline border and 12px radius.

## Buttons and targets

Buttons are 48px high (44px for small), 12px radius, 1px strong hairline, transparent fill. The primary button is turmeric with ink text. Danger actions use a madder outline, or a filled madder button for the final confirmation. Icon buttons are 44 by 44. Pressing scales to 0.98.

## Elevation

None, except the toast shadow. Depth comes from hairlines and the ground change in the dock and sheets.

## Motion

Short: 180ms colour and transform on controls; 500ms ease-out on balance bar width; a settle animation on a fresh ledger entry; skeletons while loading. Under `prefers-reduced-motion: reduce`, the entry and skeleton animations and the bar transition are off.

## Accessibility

- Focus: `outline: 3px solid var(--gp-focus)` with 2px offset on every focusable element on the route and in its sheets. Checked by tabbing through the page at 390px and 1280px in both themes; every stop had a visible outline.
- A "Skip to content" link is first in the tab order.
- Lists have accessible names (`Expenses`, `Balances`, `Payments`); sheets are dialogs named by their title; Escape closes them.
- Touch targets are at least 44px.
- Colour is never the only signal for owed versus owes, who is selected, or who a mark belongs to.
- Text and fill colours were chosen per theme for contrast against the ground; the dark theme lifts madder, green and the person tones to lighter values.

## Rules

Do:
- Use hairlines and spacing to group; keep one primary action per view.
- Write amounts with the currency symbol, two decimals, and a true minus sign (`−`).
- Keep money exact: figures shown must reconcile to the cent.

Do not:
- Add cards, drop shadows, gradients, or stat tiles to this route.
- Name or imitate a real textile tradition in copy or iconography; the marks are original.
- Show guest-only or account-only features without saying which they are.

## Verification record

Recorded on the final build: lint clean; 126 unit tests across 15 files pass; production build succeeds; secret scan passes; 10 Playwright tests pass on desktop Chrome and Pixel 7 emulation; no horizontal overflow and no console errors at 390px and 1280px in light and dark.
