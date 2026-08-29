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
  showing date, payee, category, account, amount, and memo if present. A transaction
  split between multiple people shows a "Shared · your share: $X" badge when a specific
  user is selected, so you can tell at a glance what your actual liability is versus
  the transaction's full amount.

## Accounts

Manage your checking accounts, savings accounts, credit cards, and so on.

The accounts table lists **Name, Type, Balance, Currency, Owners,** and row actions.
The **Owners** column shows each owner as "Name (percentage%)".

- **+ New Account** opens an inline form: name, type, starting balance, and currency
  (pick from a curated list of common currencies, or choose "Other…" to type any
  3-letter code).
- Every account also has an **ownership** sub-table where you add one or more owners
  and set each one's ownership percentage. This is what determines who an account
  (and its balance) shows up for when a specific user is selected. **The percentages
  across all owners must add up to exactly 100%** before you can save — the form
  validates this for you.
- **Edit** turns the row's cells into editable inputs in place; **Delete** asks for
  confirmation first.
- You can't delete an account that still has transactions on it — remove or reassign
  its transactions first.

## Categories

Categories classify transactions (e.g. Groceries, Rent, Salary).

The table lists **Name, Type, Default Split,** and row actions.

- **+ New Category** (and Edit) lets you set a name, a type (free text — commonly
  Income, Expense, or Transfer), and an optional **default split**: a set of per-user
  percentages that will automatically be applied to every transaction in this category,
  unless a transaction manually overrides it. If you don't set a default split for a
  category, transactions in it fall back to the household's [global split
  weights](#split-weights) instead.
- If you do set a default split, its percentages must add up to 100%.
- You can't delete a category that still has transactions assigned to it.

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
when, what fields changed, and whether it originated from a CSV import.

### Adding or editing a transaction

The transaction form captures:

- **Date** and an **accounting month** offset — normally a transaction counts toward
  the reporting month it's dated in, but you can shift it up to 3 months earlier or
  later (e.g. a paycheck dated the last day of the month that should count toward next
  month).
- **Payee**, an optional **memo**, and the **amount** (negative for an expense,
  positive for income).
- The **account** and **category** it belongs to.
- A **"Customize split"** checkbox. Leave it unchecked to see a live preview of how
  the transaction will automatically be split (based on the category's default split,
  or the household's global split weights if the category has none). Check it to
  manually set each person's share instead — manual shares must add up to exactly the
  transaction's amount.

Deleting a transaction asks for confirmation first.

## Users

Manage the people in your household.

The table lists **Name, Email,** and row actions. **+ New User** / **Edit** capture a
name and an optional email address. Clicking a user's name anywhere in this table sets
them as the currently selected user (same effect as picking them from the header
dropdown).

You can't delete a user who still owns a share of any account — remove their ownership
from those accounts first (or delete the accounts).

## Split Weights

This screen sets the household's **global fallback split** — a relative weight per
user (not necessarily a percentage) used to divide any transaction whose category has
no default split and that wasn't manually overridden. For example, weights
proportional to each person's income can be used so shared expenses split
proportionally rather than 50/50 by default.

Weights must be zero or greater, and must add up to more than zero overall (otherwise
there's nothing to divide by).

This is the lowest-priority tier: a manual per-transaction split always wins, followed
by a category's own default split, and only then these global weights.

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

- **Amounts by Category** — a bar chart color-coded by Income vs. Expense.
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
| Default split percentages must sum to 100% | Category default split |
| Manual transaction split shares must sum to the transaction's amount | Transaction "Customize split" |
| Global split weights must be ≥ 0 and sum to more than 0 | Split Weights screen |
| Currency must be a 3-letter code (e.g. `EUR`, `USD`) | Accounts |
| Can't delete an account with existing transactions | Accounts |
| Can't delete a category with existing transactions | Categories |
| Can't delete a user who still owns a share of an account | Users |

Split priority, from highest to lowest: a transaction's own **manual override** beats
its **category's default split**, which beats the household's **global split weights**.
If none of these apply, the transaction simply isn't split.
