# Savings accounts to import — TEMPLATE

Copy to `accounts.local.md` (git-ignored) and fill in. The skill does this for you
by asking questions if the file is missing. Never put a password, PIN, one-time
code, full IBAN or full account number in here.

## Bank: <bank name>

- **Website entry point:** <URL of the bank's customer area>
- **How to log in:** <e.g. "customer number + keypad, then approve on the phone app">
- **Statement download available:** <yes, CSV from the account page / no>
- **Date format on screen:** <e.g. DD/MM/YYYY>
- **Amount format on screen:** <e.g. "1 234,56 €", money out shown with a minus sign>

### Accounts

| Label at the bank | Last 4 digits | MyFinance account | MyFinance account id | How to reach it |
|---|---|---|---|---|
| <e.g. Savings book A> | <1234> | <e.g. Savings book A> | <12> | <e.g. Accounts → Savings → click the account name> |

### Default categories

| Kind of movement | How to recognise it | MyFinance category |
|---|---|---|
| Yearly interest | <e.g. label starts with "INTERETS"> | <e.g. Savings interest> |
| Transfer from/to the current account | <e.g. label starts with "VIR"> | <e.g. Internal transfers> |

## Troubleshooting

<Notes from previous runs: pop-ups to dismiss, pages that paginate oddly,
sessions that time out, etc.>
