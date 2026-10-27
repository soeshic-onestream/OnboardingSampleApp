# Value Mapping — Implementation Checklist

Branch: `feat/Value-Mapping`

**Goal:** CS can pick a customer, see every distinct picklist value in that customer's data, accept or fix an auto-suggested target value, and see dates and numbers normalized. All three sample customers should come out with the same vocabulary.

**Depends on:**

- **CSV upload** (Hal), which provides the parsed rows.
- **Schema mapping** (Hal), which says which source column is which target field.

Value mapping works on *target fields*, so it can start before both are done. To begin, hardcode the column map for the three sample customers and swap it out later.

---

## 0. Agree contracts with Hal (do first, ~5 min)

- [ ] **Parsed-data shape** coming out of upload, e.g. `{ customerKey, entity: 'clients'|'contacts'|'accounts'|'transactions', headers: string[], rows: Record<string,string>[] }`. All values stay **strings**; value mapping does the typing.
- [ ] **Column-map shape** coming out of schema mapping, e.g. `{ customerKey, entity, columns: { [sourceColumn]: targetField } }`.
- [ ] **Target field names** for the fields value mapping owns (see section 2). Hal's schema mapping should offer exactly these names.
- [ ] **Customer identity.** The store only seeds Acme (`cust_001`). Decide who seeds ABC Accounting, XYZ Financial Services, and Premier Bookkeeping into `store.customers`, and what key we use for them (customer id vs. sample-data folder).
- [ ] **File ownership, to avoid merge conflicts.** `App.jsx` and `server/src/index.js` are single files that everyone edits. Put value mapping in its own files (`client/src/ValueMapping.jsx`, `server/src/mapping/valueMapping.js`, `server/src/routes/valueMappings.js`) and add only a one-line mount or render to the shared files.
- [ ] **UI placement.** Put value mapping inside the existing **Data Mapping** tab as a second section, not in a new tab. `tests/e2e/dashboard.spec.js` asserts there are exactly 5 tabs.

## 1. Data quirks to handle (found by reading `sample-data/`)

These aren't all in `sample-data/README.md`:

- [ ] **Unquoted commas break rows.** These are upload problems, so tell Hal:
  - Customer B `clients.csv`: `mainContact` is `Williams, Robert` with no quotes, which creates an 11th column.
  - Customer A `chart_of_accounts.csv` line 33: description `Electric, gas, water` is unquoted, so `Parent Account` becomes `gas`.
  - Value mapping should flag these as **invalid values**, not drop them silently.
- [ ] **Leading zeros must survive.** Customer C `nominal_code` / `customer_id` values (`0010`, `0020`) and every tax ID stay strings. Never run codes through number parsing.
- [ ] **Undocumented picklist values.** These appear in the data but not in the README tables:
  - Payment methods, A: `Bank Charge`, `Financing`, `Journal Entry`
  - Payment methods, B: `EFT`, `FEE`, `JE`, `LEASE`
  - Payment methods, C: `Bank`, `Card Payment`, `Direct Debit`, `HP`, `Online Payment`, `Petty Cash`, `Standing Order`, `Wire`
  - Account categories, C: `Finance Costs`
- [ ] **Different currencies.** Customer C amounts are GBP (`amount_gbp`); A and B are presumably USD.
- [ ] **Ambiguous dates.** `01/02/2024` is Jan 2 for A and would be Feb 1 for C. Set the date format **per customer**; never guess per value.

## 2. Canonical vocabularies (target values)

Define these as data in one module, `server/src/mapping/vocabularies.js`. Each entry is a target value plus the known aliases for each customer.

- [ ] `client.status`: `active` | `inactive` | `pending`
  - A: `Active`/`Inactive`/`Pending`
  - B: `A`/`I`/`P`
  - C: `ACTIVE`/`DORMANT`/`SUSPENDED`
- [ ] `client.entityType`: `corporation` | `s_corporation` | `llc` | `partnership` | `sole_proprietor` | `non_profit`
  - C: `Limited Company`→`corporation`, `LLP`→`llc`, `Sole Trader`→`sole_proprietor`
- [ ] `client.paymentTermsDays` (integer)
  - `Net 30` / `NET30` / `30 Days` → `30`
  - `Due on Receipt` / `COD` / `Immediate` → `0`
- [ ] `contact.status`: `active` | `inactive` | `pending`
  - B: `isActive` `Y`/`N`/`P`
  - C: `Active`/`Dormant`/`Suspended`
- [ ] `contact.preferredChannel`: `email` | `phone` | `sms`
  - B: `TEXT`→`sms`
- [ ] `transaction.type`: `debit` | `credit`
  - `Debit`/`DR`/`D`, `Credit`/`CR`/`C`
- [ ] `transaction.status`: `completed` | `pending` | `cancelled`
  - A: `Cleared`/`Pending`/`Voided`
  - B: `POSTED`/`PENDING`/`VOID`
  - C: `Reconciled`/`Unreconciled`/`Cancelled`
- [ ] `transaction.paymentMethod`: `wire` | `ach` | `check` | `card` | `cash` | `bank_transfer` | `direct_debit` | `standing_order` | `bank_fee` | `journal_entry` | `financing` | `other`
  - Map every value listed in section 1, plus `BACS`→`ach` and `Cheque`→`check`.
- [ ] `account.type`: `asset` | `liability` | `equity` | `revenue` | `expense`
  - C: `Capital`→`equity`, `Income`→`revenue`, `Direct Costs`/`Overheads`/`Finance Costs`→`expense`
- [ ] `account.normalBalance`: `debit` | `credit`
  - `Debit`/`DR`/`D`, `Credit`/`CR`/`C`
- [ ] `account.isActive` (boolean): `Active` / `1` / `Yes` / `Y` → `true`
- [ ] **Defer** (free text or customer-specific codes; not worth it in the first slices): industry/sector, department/division, transaction category/cost centre, account sub-type.

## 3. Thin slices (each one is usable on its own)

### Slice A: Normalizer core (server, pure functions, no UI)

- [ ] `server/src/mapping/valueMapping.js`:
  - `suggestValue(field, rawValue)` returns `{ value, confidence: 'exact'|'alias'|'none' }`. Match case- and whitespace-insensitively against the target value and the aliases.
  - `normalizeDate(raw, format)` supports `MM/DD/YYYY`, `YYYY-MM-DD`, `DD-MM-YYYY` and returns ISO `YYYY-MM-DD`. Return `null` (invalid) for impossible dates such as `31-02-2024`.
  - `normalizeNumber(raw)` handles `2500000.00`, `1850000`, and defensively `1,250.00`, `(500.00)`, `£`/`$`. Returns a number or `null`.
  - `normalizeRow(row, columnMap, customerConfig)` returns `{ normalized, issues: [{ field, raw, reason }] }`.
- [ ] `server/src/mapping/valueMapping.test.js` (`node:test`, picked up by the existing `npm test` glob):
  - Every alias in section 2 for all three customers resolves to the same target value.
  - Unknown values return `confidence: 'none'`.
  - Each date format is tested, including an invalid date.
  - Leading-zero codes are untouched.
  - The two broken rows from section 1 produce issues instead of crashing.
- [ ] `just test-unit` is green.

### Slice B: Read-only API

- [ ] `GET /api/value-mappings/vocabularies` returns the canonical fields and allowed values.
- [ ] `POST /api/value-mappings/suggest`
  - Body: parsed data plus column map.
  - Returns, for each value-mapped field, the distinct source values with `{ raw, count, suggested, confidence }`.
- [ ] Until Hal's slices land, add a temporary loader that reads the `sample-data/` CSVs on the server with a hardcoded column map for the three customers. Delete it once upload and schema mapping exist.
- [ ] Mount the router in `server/src/index.js` with one line.

### Slice C: Value-mapping UI (first slice CS can actually use)

- [ ] `client/src/ValueMapping.jsx`, rendered in the Data Mapping tab below Hal's schema mapping section.
- [ ] Customer picker, then entity picker, then one table per value-mapped field:

  | Source value | Count | Target value | Status |
  |---|---|---|---|

  The target value is a dropdown pre-filled with the suggestion.
- [ ] Unmapped values (`confidence: 'none'`) are visually highlighted and counted in a header, e.g. "3 values need attention".
- [ ] The page still loads and shows a clear empty state when no data has been uploaded yet.
- [ ] Playwright test: open Data Mapping, pick Customer B, and verify the `clientStatus` value `A` is suggested as `active`.

### Slice D: Save overrides

- [ ] Add `valueMappings: []` to the in-memory store in `server/src/data/store.js`. Each entry is `{ customerKey, field, raw, value }`, with `get`/`upsert` functions in the existing style.
- [ ] `PUT /api/value-mappings/:customerKey` saves CS's choices. On later `suggest` calls, saved choices win over auto-suggest (`confidence: 'manual'`).
- [ ] UI saves on dropdown change and shows that it saved. Reloading the tab keeps the choices (until the server restarts, since storage is in-memory).
- [ ] Unit test: a saved override beats the alias dictionary.

### Slice E: Dates, numbers, and currency per customer

- [ ] Per-customer config `{ dateFormat, currency }` lives in the store and is editable in the UI.
- [ ] Auto-suggest the date format by testing the customer's date columns against each format. Choose the one where every value parses and at least one value rules out the others (a day greater than 12). Show 3 sample values as "raw → ISO" so CS can confirm.
- [ ] Defaults: A = `MM/DD/YYYY` + USD, B = `YYYY-MM-DD` + USD, C = `DD-MM-YYYY` + GBP.

### Slice F: Normalized preview and step completion

- [ ] `POST /api/value-mappings/preview` returns normalized rows plus issues. The UI shows the first ~20 normalized rows next to the raw rows.
- [ ] A "Value mapping complete" button is enabled only when there are 0 unmapped values and 0 invalid dates or numbers.
- [ ] Coordinate with the **onboarding progress** slice: the button calls its step-update endpoint so `Data Mapping` turns `completed` on the dashboard. Until that endpoint exists, hide the button.
- [ ] Hand-off to **Import**: expose `normalizeRow` (or the preview endpoint) so Import consumes normalized data and never re-parses raw strings.

## 4. CS decisions to confirm (don't guess silently)

Ship the defaults below, but surface each one in the UI so CS can override it.

- [ ] C `SUSPENDED` → `pending`? The README says so, but "suspended" usually means inactive or on hold.
- [ ] C `Limited Company` → `corporation`? The README lists it under both Corporation and S-Corporation.
- [ ] C `LLP` → `llc`? An LLP is closer to a partnership.
- [ ] C `Unreconciled` → `pending`? A transaction can be posted but not yet reconciled.
- [ ] B `EFT`, and the A/B/C `Direct Deposit` / `BACS` values → all `ach`?
- [ ] Undocumented payment methods (`HP`, `Petty Cash`, `Online Payment`, `LEASE`, `Financing`): map them to `financing`/`cash`/`card`/`other`?
- [ ] Do we convert GBP amounts, or store the amount and currency side by side? Recommendation: side by side, no FX.

## 5. Done-when

- [ ] `just test` (unit + e2e) is green, and the existing dashboard e2e tests still pass.
- [ ] For each of the three sample customers, every value-mapped field shows 0 unmapped values after CS confirms the defaults.
- [ ] Dates for all three customers render as ISO, and amounts are numbers with currency attached.
- [ ] Update the README's API endpoint table with the new `/api/value-mappings/*` routes.
