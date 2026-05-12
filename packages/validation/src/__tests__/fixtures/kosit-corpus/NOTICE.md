# Vendored test corpus — attribution

This directory contains test invoice instances vendored verbatim from the
**KoSIT XRechnung test suite**.

- **Source:** https://github.com/itplr-kosit/xrechnung-testsuite
- **Commit:** `48088e0ef7a4e87d67cc6fa967e4a3a8311bf196`
- **License:** Apache License 2.0 — see https://www.apache.org/licenses/LICENSE-2.0
- **Copyright:** Koordinierungsstelle für IT-Standards (KoSIT) / xeinkauf.de

Layout (mirrors the upstream `src/test/` tree, flattened one level):

| Folder | Upstream path | Use |
|---|---|---|
| `business-cases-standard/` | `src/test/business-cases/standard/` | Realistic conformant XRechnung invoices (UBL + UN/CEFACT). Expected `valid`. |
| `business-cases-extension/` | `src/test/business-cases/extension/` | XRechnung Extension business cases. Expected `valid`. |
| `technical-cases-cius/` | `src/test/technical-cases/cius/` | Edge-case / boundary CIUS instances. Expected to parse; violations allowed. |
| `technical-cases-cvd/` | `src/test/technical-cases/cvd/` | Code-value-domain edge cases. Expected to parse; violations allowed. |

## `manifest.json`

`manifest.json` lists every EN 16931 rule ID (`BR-*`, `BR-CO-*`, `BR-CL-*`, per-VAT-category `BR-S/Z/E/AE/G/IC/IG/IP/O-*`) derived once from the EN 16931 Schematron abstract model + codelist asserts:

- **Source:** https://github.com/ConnectingEurope/eInvoicing-EN16931
- **Commit:** `b6c9e06a59812fb1a83585da40923b3678a649ad` (tag `validation-1.3.16`)
- **License:** see upstream repo (CC-BY-4.0 / EUPL — schematron rule **identifiers** only are reproduced here, no rule logic).

`rules.coverage.test.ts` asserts that every ID in `manifest.json` is implemented
(or present as a typed no-op stub pending implementation) in the rule arrays.
New rule sets land = manifest bump + new rule entries; the test catches drift
before merge.

> Regenerated only by hand — do **not** regenerate `manifest.json` dynamically in CI.
