# MyFinance User Guide

This guide walks through every screen in MyFinance and how to use it. It's written for
people *using* the app to track household finances — for schema/database details, see
[`data-model.md`](./data-model.md) instead.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard](#dashboard)
3. [Accounts](#accounts)
4. [Categories](#categories)
5. [Transactions](#transactions)
6. [Users](#users)
7. [Split Weights](#split-weights)
8. [Import CSV](#import-csv)
9. [Backup & Restore](#backup--restore)
10. [Charts](#charts)
11. [Appendix: Validation Rules & Tips](#appendix-validation-rules--tips)

## Getting Started

### First launch

The first time you open MyFinance, a prompt appears asking you to pick who you are from
the list of users. This prompt can't be dismissed without choosing — MyFinance needs to
know which person is "you" so it can filter and personalize views. Your choice is
remembered between visits.

### The header bar

Every screen shares the same header:

- **User selector** — a dropdown showing "All Users" or a specific person. This is the
  single most important control in the app: it decides which accounts, transactions,
  and balances you see everywhere else. Switching users (or back to "All Users") is
  instant and remembered the next time you open the app.
- **Theme toggle** — switches between light and dark mode.
- **Settings menu** (gear icon) — navigates between all the other screens: Accounts,
  Categories, Transactions, Users, Split Weights, Import CSV, Backup & Restore, and
  Charts.

### The "Filtering by" banner

Whenever a specific user (not "All Users") is selected, a banner appears at the top of
the active view reading "Filtering by: *Name* · Clear". Click **Clear** to switch back
to "All Users" without opening the dropdown. When a specific user is selected:

- **Accounts** and **Dashboard** only show accounts that person has an ownership share in.
- **Transactions** only shows transactions on an account they own, or where they're
  entitled to a split share.
- Amounts on shared transactions show that person's own share, not the full amount.

Every other screen (except Dashboard, which *is* the home screen) has a **Back** link
to return to the Dashboard, and the current screen is reflected in the page URL — so
you can bookmark or share a link to a specific view.

## Dashboard

The Dashboard is the home screen and gives an at-a-glance summary:

- **Balance widget** — who owes whom. With exactly two users in the household, this
  reads as a plain sentence: "*Alice* owes *Bob* $42.50" (or "All settled up" if the
  net is zero). With more than two users, it instead lists each person's net position
  (green if the household owes them, red if they owe the household), grouped by
  currency for households with accounts in more than one currency.
- **Account cards** — one card per visible account, showing its name, type, and current
  balance (colored green for positive, red for negative).
- **Recent transactions** — the last 10 transactions across your visible accounts,
  showing date, payee, category, account, amount, and memo if present. Category is
  shown as a colored icon badge (or a gray "Uncategorized" badge if none is set), not
  just a plain label. A transaction split between multiple people shows a "Shared ·
  your share: $X" badge when a specific user is selected, so you can tell at a glance
  what your actual liability is versus the transaction's full amount.

## Accounts

Manage your checking accounts, savings accounts, credit cards, and so on.

The accounts table lists **Name, Type, Balance, Currency, Owners,** and row actions.
The **Owners** column shows each owner as "Name (percentage%)".

- **+ New Account** opens an inline form: name, type, starting balance, and currency
  (pick from a curated list of common currencies, or choose "Other…" to type any
  3-letter code).
- Every account has two independent sub-tables when you add or edit it:
  - An **ownership** sub-table where you add one or more owners and set each one's
    ownership percentage. This is what determines who an account (and its balance)
    shows up for when a specific user is selected, and it drives who's on the hook for
    the "paid" side of the household balance. **The percentages across all owners must
    add up to exactly 100%** before you can save — the form validates this for you.
  - A **Split Weight** sub-table — an optional, separate integer weight per person,
    used only to prefill the split on new transactions for this account (see
    [Split Weights](#split-weights) for how the three weight tiers work together).
    This has nothing to do with ownership: a single-owner account can still have a
    split weight configured, and changing one never affects the other.
- **Edit** turns the row's cells into editable inputs in place; **Delete** asks for
  confirmation first.
- You can't delete an account that still has transactions on it — remove or reassign
  its transactions first.

## Categories

Categories classify transactions (e.g. Groceries, Rent, Salary). A category can
optionally have **subcategories** — one extra level of grouping (e.g. "Housing" as a
parent with "Rent" and "Home Insurance" underneath). Only two levels are allowed: a
subcategory can't itself have subcategories.

The table lists **Name, Type, Default Split,** and row actions. A category with
subcategories shows a count ("N subcategories") and an expand/collapse arrow; clicking
it reveals the subcategories indented underneath, along with a **+ Add subcategory**
action that opens the New Category form pre-filled with that parent.

- **+ New Category** (and Edit) lets you set a name, a type (free text — commonly
  Income, Expense, or Transfer), an optional **parent category**, a **color** and an
  **icon** (pick from a curated set of finance-themed icons), and an optional
  **default split weight**: a set of per-user integer weights used to prefill the
  split on any new transaction in this category — this is the highest-priority of the
  three weight tiers (see [Split Weights](#split-weights)). If you don't set one for a
  category, new transactions in it fall back to the account's split weight, and then
  to the household's global split weight, instead.
- Picking a parent category **locks the type field** to match the parent's — a
  subcategory always shares its parent's type. Only a top-level category can be
  chosen as a parent (no 3-level nesting).
- A category that already has subcategories can't be turned into a subcategory
  itself, and its type can't be changed while it still has subcategories.
- Both a parent category and its subcategories can be assigned directly to a
  transaction — picking the most specific one is never required.
- The color and icon show up as a small colored badge wherever the category appears —
  in this table, on Transactions rows, and in the Dashboard's recent transactions.
- Weights just need to be zero or greater, with at least one greater than zero — unlike
  ownership, there's no requirement that they add up to any particular total, since
  they're a ratio (e.g. 2:1) rather than a percentage. A subcategory does **not**
  inherit its parent's default split weight — each category's weight tier (if any) is
  its own.
- You can't delete a category that still has transactions assigned to it, or one that
  still has subcategories — delete or reassign those first.

## Transactions

The most detailed screen in the app — this is where you record and review individual
transactions.

### Finding transactions

Two filtering modes are available:

- **Simple filters**: free-text search over payee/memo, a date range, account and
  category dropdowns, and a min/max amount range. **Clear** resets all of these.
- **Advanced filters**: build arbitrary AND/OR conditions across payee, memo, amount,
  date, account, or category, each with its own operator (contains, equals, between,
  greater/less than, etc.) — useful for more precise or compound searches than the
  simple filters allow.

Results can be sorted by any column and paginated (25, 50, or 100 rows per page).
Your filters, sort order, and page are all kept in the page URL, so you can bookmark
or share a specific search.

The results table groups transactions by date and can be expanded per-row to show a
**History** panel: a full audit trail of who created or edited the transaction and
when, what fields changed, and whether it originated from a CSV import. Changes to
the transaction's own split weights — set on creation or edited later — are tracked
here too, shown as each involved user's weight before and after the change.

### Adding or editing a transaction

Clicking **+ New Transaction** or an existing row both open the same panel. The form
captures:

- **Date** and an **accounting month** offset — normally a transaction counts toward
  the reporting month it's dated in, but you can shift it up to 3 months earlier or
  later (e.g. a paycheck dated the last day of the month that should count toward next
  month).
- **Payee**, an optional **memo**, and the **amount** (negative for an expense,
  positive for income).
- The **account** it belongs to, and its **category** — picking a category is
  optional; leaving it as "Uncategorized" (the default) is a valid, final choice, and
  such transactions display with a gray "Uncategorized" badge instead of a category
  name. The category field is a searchable dropdown: subcategories are grouped and
  indented under their parent, the parent itself is also selectable, and typing in the
  search box filters the list by category or parent name. The same picker is used for
  the Transactions screen's category filters.
- A **Split** section, always visible — no separate "customize" step. It shows one
  integer **weight** per involved person, with a read-only euro amount next to each
  that updates live as you type (each person's share is that person's weight divided
  by the total weight, times the transaction amount, rounded to the cent — any
  rounding remainder goes to the last person so the shares always add up exactly).
  - When you pick a category and account, the weights are prefilled automatically
    from whichever tier applies first: the **category's** default split weight, then
    the **account's**, then the household's **global** weight (see
    [Split Weights](#split-weights)).
  - **Quick-fill buttons** let you pull in weights at any time, overwriting
    whatever's currently in the fields: Global, Account, and Category pull in a
    specific tier's weights (disabled if that tier has nothing configured);
    **Split Evenly** sets weight 1 for every user; and a button per user (named
    after them) assigns weight 1 to that user alone, with no one else in the split.
  - You can also just type your own weight for anyone directly — there's no
    requirement that the numbers add up to anything in particular, or match any tier.
  - Editing an **existing** transaction always starts from its own previously-saved
    weights, never re-prefilled from the category/account/global config as it
    currently stands — the quick-fill buttons are the only way to pull a tier's
    *current* weights into an existing transaction.

The **Delete** button and the **History** panel only appear once the transaction
already exists — there's nothing to delete or show history for while you're still
filling in a new one. Deleting a transaction asks for confirmation first.

### Bulk editing transactions

Select multiple transactions using the checkboxes in the results table — a checkbox
in the header selects or deselects every transaction currently shown on the page
(selection is per-page; it doesn't carry over when you change page or filters). Once
at least one row is selected, a bar appears above the table showing how many are
selected, with **Bulk Edit** and **Clear selection** buttons.

**Bulk Edit** opens a dialog with three independent, optional changes you can apply
together in a single save:

- **Category** — leave this off to keep each transaction's own category unchanged;
  turn it on to set every selected transaction to the same category (including
  explicitly choosing "Uncategorized").
- **Accounting month** — leave this off to keep each transaction's own accounting
  month; turn it on to shift all of them by the same offset (e.g. +1 month). Because
  the shift is relative to each transaction's own date, transactions with different
  dates each land on their own correct target month, not necessarily the same
  calendar month as each other.
- **Split** — leave this off to keep each transaction's own existing split
  untouched; turn it on to enter one set of per-person weights that gets applied to
  every selected transaction. Each transaction still gets its own share amounts,
  proportioned against its own amount — the weights are shared, but the euro amounts
  are not.

At least one of the three must be turned on to save. After saving, you'll see a
confirmation, the list refreshes, and the selection is cleared.

## Users

Manage the people in your household.

The table lists **Name, Email,** and row actions. **+ New User** / **Edit** capture a
name and an optional email address. Clicking a user's name anywhere in this table sets
them as the currently selected user (same effect as picking them from the header
dropdown).

You can't delete a user who still owns a share of any account — remove their ownership
from those accounts first (or delete the accounts).

## Split Weights

Every transaction's split is driven by its own per-user integer **weight** — see
[Adding or editing a transaction](#adding-or-editing-a-transaction). Rather than typing
those weights from scratch every time, MyFinance lets you configure three fallback
tiers that prefill sensible defaults, checked in this order (first match wins):

1. **Category** — set per-category on the [Categories](#categories) screen. Highest
   priority: e.g. "Rent" can always default to 1:1 regardless of the account or
   household default.
2. **Account** — set per-account on the [Accounts](#accounts) screen, in a sub-table
   that's completely separate from ownership. Useful when one particular account (say,
   a joint account funded unevenly) should default differently from the rest of the
   household.
3. **Global** — set on this screen, and used whenever neither the category nor the
   account has a weight configured. For example, weights proportional to each person's
   income can be used so shared expenses default to splitting proportionally rather
   than 50/50.

All three are just relative weights, zero or greater, with at least one greater than
zero — there's no requirement that they add up to 100 or any other total, since it's a
ratio (e.g. 2:1), not a percentage.

**These tiers only ever prefill.** Once a transaction is saved, its own weights are
what's used going forward — editing a tier later never reaches back and changes an
already-saved transaction. The Global/Account/Category quick-fill buttons on the
transaction form are the only way to pull a tier's *current* weights into an existing
transaction.

## Import CSV

Bulk-load transactions from a bank or credit card export instead of entering them by
hand. It's a four-step wizard:

1. **Upload & account** — choose the CSV file and the account its transactions belong to.
2. **Format detection** — MyFinance auto-detects the file's encoding, delimiter, date
   format, decimal separator, and which column maps to which field (date, payee,
   amount, etc.), showing a preview of a few sample rows. You can correct any of these
   before continuing.
3. **Review** — every row is shown with a status badge: **OK**, **Needs category**
   (you must assign one before it can be imported), **Possible duplicate** (looks like
   a transaction that already exists), or **Error**. You can override the category per
   row, or check a box to skip importing that row entirely.
4. **Commit** — imports everything that isn't skipped or erroring, and confirms when done.

Imported transactions are tagged as such, and show up in a transaction's
[History](#adding-or-editing-a-transaction) panel later.

## Backup & Restore

- **Export Backup** downloads a zip file containing a full JSON snapshot of your data —
  keep this somewhere safe before making risky changes, or as a periodic backup.
- **Import Backup** uploads a previously exported zip file, in one of two modes:
  - **Overwrite** replaces all existing data with the backup's contents. This is
    destructive and asks you to confirm before proceeding.
  - **Append** adds the backup's data alongside what's already there, and also asks
    for confirmation first.

## Charts

Visual summaries of spending and income. This screen requires a specific user to be
selected (not "All Users") — it's opt into your own view of the household's finances.

Three charts are shown:

- **Amounts by Category** — a bar chart color-coded by Income vs. Expense. Any
  uncategorized transactions are grouped into their own gray "Uncategorized" bar so
  they're never silently left out of the totals.
- **Income vs. Expense by Month** — how the two compare over time.
- **Net by Month** — the running net (income minus expense) per month.

If your accounts span more than one currency, a currency selector lets you switch
which currency's transactions the charts summarize (amounts across currencies are
never combined into one number).

## Appendix: Validation Rules & Tips

A quick reference for the rules the app enforces:

| Rule | Where it applies |
|------|-------------------|
| Ownership percentages must sum to exactly 100% | Account owners |
| Split weights must be ≥ 0, with at least one > 0 — no sum requirement | Category, Account, and Global split weights; a transaction's own split |
| Currency must be a 3-letter code (e.g. `EUR`, `USD`) | Accounts |
| Can't delete an account with existing transactions | Accounts |
| Can't delete a category with existing transactions | Categories |
| Can't delete a category with existing subcategories | Categories |
| A subcategory's type must match its parent's, and only 2 levels of categories are allowed | Categories |
| Can't delete a user who still owns a share of an account | Users |

Split-weight prefill priority, from highest to lowest: a transaction's **category**
weight beats its **account** weight, which beats the household's **global** weight. If
none of these apply and you don't type your own weights, the transaction simply isn't
split. Ownership is a separate concept entirely — it never determines a split, only who
an account is visible to and who's on the hook for the "paid" side of the household
balance.
