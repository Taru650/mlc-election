# MLC Polling Personnel Randomisation — offline tool

A single HTML file, **`MLC_Polling_Personnel_Tool.html`**, that runs in any modern browser
(Chrome, Edge, Firefox) on any computer. No server, no database, no internet:
the Excel library, styles and code are all embedded in the file.

Any district can use it: district, constituencies, reserve %, rules, venues and
authorities are all entered on the Setup page (Bihar districts and MLC
constituencies are offered as suggestions only).

## Quick start

1. Copy `MLC_Polling_Personnel_Tool.html` to the computer and double-click it.
2. **Rehearse with test data:** *Save / Load / Test Data → Small — Load into tool*.
   Lock Setup → Training → Officers → Booths. In the 2nd randomisation, open any tab
   (Polling parties / PCCP / Micro Observers), run and re-run it as often as wanted, then lock
   that tab; do the other tabs in any order. Do the same in the final randomisation, then
   print from *Reports & Letters* (each letter set opens as soon as its own part is locked).
3. **Live data:** *Dashboard → Start a new, empty project*, then enter or import your data.
4. **Save Project (.xlsx)** regularly. That one Excel file holds everything and can be
   opened on another computer with **Open Project (.xlsx)**.

The browser also autosaves (local storage), but only for that browser on that
computer. The project Excel file is the real backup.

## Workflow and dependencies

| Step | Needs | Notes |
|---|---|---|
| Election Setup | — | Manual entry, old Setup JSON, or Configuration Excel |
| Training Schedule | — | Manual entry, old Training JSON, or Configuration Excel |
| Officers Database | Setup | Excel import (replace/append) or manual add/edit |
| **Booth Entry** | **Setup only** | **Independent** — not tied to officers, training or 1st letter |
| 1st Appointment Letter | Officers + Training | Duty and training only |
| 2nd Randomisation | Officers + Booths | Three independent parts — Polling parties, PCCP, Micro Observers — each run / re-run / locked separately, in any order; booth not disclosed |
| Final Randomisation | Same part locked in 2nd | Booth tagging, again part by part in any order; untagged = Reserve |

## Rules enforced

* A polling party is 1 Presiding Officer + P1 + P2 + P3.
* **All four members of a party are from different offices** (on by default). “Same office” means
  the same **Office Code**; only when an officer has no office code is the office name used
  (optionally name + address).
* **Nobody is tagged to a booth whose block is his/her home block or posting block** —
  applied to every PrO, P1, P2, P3, PCCP (Patrolling Magistrate) and Micro Observer.
* Optional, stricter: party members must have different posting blocks / home blocks.
* Party count per constituency = booths + reserve %; PCCP and Micro Observer counts =
  required (from Setup) + reserve %.
* Blocks are matched by **block code** (e.g. 2011 census block code) whenever both the officer
  and the booth have one — spelling of the name then does not matter. Without a code, names are
  compared loosely (case, spaces, punctuation and the word “block” ignored). Codes ignore
  spaces and leading zeros (`0101` = `101`). The tool warns when one name appears with two
  codes (likely a wrong code) or one code with two spellings (harmless; code wins).
* **TC and GC never mix:** every party / PCCP / Micro Observer belongs to one constituency and is
  only tagged to booths of that constituency. When a 2nd-randomisation part is **locked**, each
  of its officers is permanently tied to that constituency; if the part is later unlocked and
  re-run, those officers can be selected again only for the same constituency. Saved in the
  project Excel (`Constituency_Fixed`) and verified by a rule check.
* **Out-of-district blocks:** a home or posting block given as `999999` (or `999`, `Others`,
  `Out of District` … — the list is editable in Setup) is treated as outside the district and
  excludes no booth. An officer living outside the district can therefore be tagged in any
  block except his/her (in-district) posting block; one with both blocks outside can go to
  every block. A booth may not use these markers.
* **Secrecy:** the 2nd and final randomisation screens (and the shuffle animation) show only
  PINs. Names, designations, offices, mobiles and blocks appear only in letters, reports,
  attendance sheets and Excel exports.

How it is guaranteed: in the 2nd randomisation every main party is formed against a
hidden random booth so a valid assignment always exists; the final randomisation is
a fresh random bipartite matching of *all* formed parties to booths, so which parties
become Main or Reserve is decided only at the final stage. After every run an
**independent rule check** re-verifies every rule; locking is refused if any check fails.
Randomness uses the browser's cryptographic generator (`crypto.getRandomValues`).

If the data cannot satisfy the rules (e.g. every Presiding Officer lives or works in one
block that has booths), the tool says exactly which block and duty is short.

## Exemptions

*Exemptions* (between the 1st letter and the 2nd randomisation) withdraws officers after
training — tick them or type PINs, choose a category (Medical, Administrative, …), write the
reason (mandatory) and an optional order reference. Exempted officers are never considered in
the 2nd or final randomisation. An officer already selected in a **locked** part cannot be
exempted (use a reserve); one in an unlocked part can be, and that part is discarded for a
re-run. Exemptions can be withdrawn (*Restore*), are saved in the project Excel (`Exemptions`
sheet), and are printed in the **Exemption Register** (print / PDF / Word / Excel).

## Party letters: office copy and 4-copy distribution set

For polling parties, both the 2nd and the final letters can be produced as an **office copy**
(one letter per party / booth) or a **distribution set** (four copies per party — copy 1 has
a ✔ before the Presiding Officer, copy 2 before P1, copy 3 before P2, copy 4 before P3, and
each is marked “Copy n of 4 — for …”). The **Power vesting list** gives, party-wise, the
Presiding Officer and Polling Officer-1 (PIN, name, designation, office, mobile) for approval
of magisterial powers (print / PDF / Word / Excel).

## Communication plan

After the polling-party final tagging is locked, *Communication plan* gives one block per
booth — **Booth No. — full booth name**, block, constituency and party number — followed by a
table of Presiding Officer, P1, P2, P3 and the Micro Observer tagged to that booth with PIN, name, designation and mobile. Print / PDF /
Word keep each booth's block on one page; *Excel* gives one row per officer per booth. Tests
check every row against the booth → party → officer allotment (12- and 140-booth datasets).
The older one-line-per-booth sheet is still available as *Communication matrix*.

## Letters as PDF and Word

Every letter / report window has **Print / PDF** (choose “Save as PDF” as the printer) and
**Word (.docx)**. The Word file is built inside the browser from the same layout — bordered
tables, signature image, one letter per page — and opens in MS Word or LibreOffice for editing.

## File formats

**Project workbook** (`Save Project`): sheets `Setup`, `Constituencies`, `Training`,
`Officers`, `Booths`, `Second_Parties`, `Second_PCCP`, `Second_Micro`, `Final_Polling`,
`Final_PCCP`, `Final_Micro`, `Status`, `Signature`, `Audit_Log`. The first five can be
prepared or corrected in Excel. Randomisation sheets are re-verified on opening and
discarded if any rule is broken.

**Officers** columns: `PIN, Name, Designation, Office Code, Office Name, Office Address, Mobile,
Duty, Home Block Code, Home Block, Posting Block Code, Posting Block, Account No, Bank, Branch, IFSC`.
Code columns are optional but recommended. Duty may be written as
`PRESIDING OFFICER / POLLING OFFICER-1 / -2 / -3 / PATROLLING MAGISTRATE / MICRO OBSERVER`
or `PrO / P1 / P2 / P3 / PCCP / MO`. Blank PIN → district code + serial. Many alternate
header spellings are recognised (e.g. the earlier tool's `officername`, `officename`, `block`).

**Booths** columns: `Constituency, Booth No, Main/Aux, Location / Building, Block Code, Block`.
Constituency is a code from Setup (e.g. `TC`, `GC`) or a name containing “Teachers”/“Graduates”.

Dates are `DD-MM-YYYY` (ISO and Excel dates also accepted); times `HH:MM`.

## Test data (`test-data/`)

| File | Use |
|---|---|
| `TEST_Sheohar_Project.xlsx` | 5 blocks, 6 TC + 6 GC booths, 126 officers — quick full rehearsal |
| `TEST_Muzaffarpur_Project.xlsx` | 16 blocks, 60 TC + 80 GC booths, ~1,000 officers — volume test |
| `TEST_With_Errors_Project.xlsx` | Deliberate mistakes (duplicate PIN, missing block, unknown duty…) to test validation |
| `Officers_Template.xlsx`, `Booths_Template.xlsx` | Blank formats for live data |

All names and numbers in test files are fictitious. The same datasets can be generated
inside the tool (*Save / Load / Test Data*).

## Development

```
node build.js                                   # src/ + vendor/ → MLC_Polling_Personnel_Tool.html
NODE_PATH=$(npm root -g) node tests/e2e.test.js # headless Chromium end-to-end tests (needs playwright)
WRITE_TEST_DATA=1 NODE_PATH=$(npm root -g) node tests/e2e.test.js   # also regenerates test-data/
```

The tests cover the full UI workflow, all letters/reports, Excel round-trip, 200 + 15
repeated randomisations with rule verification, randomness, infeasible-data refusal,
validation, legacy JSON import and booth-entry independence.

Embedded library: SheetJS Community Edition 0.18.5 (Apache-2.0, `vendor/SHEETJS_LICENSE`).
