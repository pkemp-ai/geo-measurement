# Northwind Pay — audit context
**Entity:** Northwind Pay — regulated stablecoin payment infrastructure for PSPs and fintechs, northwindpay.com (Northwind Pay, Inc.). A single API for stablecoin pay-ins, payouts, and conversions. NOT the Northwind sample database, the Northwind Traders fictional company in Microsoft tutorials, or any unrelated "Northwind" trade/logistics brand.

> NOTE: Northwind Pay is a FICTIONAL company invented for a public showcase of the AEO/GEO audit system. Every claim, score, finding, customer, funding figure, and quote about Northwind Pay below is synthetic. "Northwind" is borrowed from the classic Microsoft sample database precisely so readers recognize this as sample data. Competitors named (Circle, Stripe, Bridge, Brale, etc.) are real public companies used only as accurate market context.

**Mode:** prospecting
**Gathered:** 2026-06-04

## What it does
Northwind Pay describes itself as "regulated stablecoin payment infrastructure for the platforms that move money." Its self-positioning headline is "One API for stablecoin pay-ins, payouts, and conversions," with the pitch to "let any PSP or fintech move dollars onchain without touching custody, licensing, or node ops." Founded 2021, headquartered in New York City, it is a mid-stage (Series B) company that operates as a regulated infrastructure layer rather than a consumer brand.

Core product lines:
- **Pay-ins** — accept stablecoin (USDC, USDP, PYUSD) and convert to fiat at settlement, or hold onchain. Hosted checkout, virtual accounts, and a direct API.
- **Payouts** — mass and single stablecoin payouts to wallets or off-ramp to local bank rails in 40+ countries, with built-in screening and Travel Rule messaging.
- **Conversions** — programmatic fiat ↔ stablecoin and stablecoin ↔ stablecoin conversion with a quoted FX/spread, used by platforms managing multi-currency balances.
- **Wallet & treasury** — managed (MPC) wallets and a treasury console so platforms can hold, sweep, and reconcile stablecoin balances without running custody.
- **Compliance layer** — embedded KYB/KYC, sanctions/KYT screening, and Travel Rule, so the platform's compliance burden is shifted to the regulated provider.

Scale claims (fictional): processes a ~$9B annualized run-rate of stablecoin payment volume across 120+ platform customers; settles in 40+ countries; supports pay-in, payout, and conversion through a single integration.

## ICP
Payment service providers (PSPs), fintechs, neobanks, marketplaces, and payroll/payout platforms that want to add stablecoin money movement — pay-ins, cross-border payouts, multi-currency conversion — without building custody, licensing, and blockchain operations in-house. Sells to regulated, B2B platform buyers (a product/payments lead or a head of engineering), not retail end users. Strongest in cross-border payouts and marketplace settlement, with a growing LatAm and EMEA payout footprint alongside the U.S.

## Category terms (seed discoverability prompts)
- stablecoin payment infrastructure
- stablecoin payments API
- stablecoin pay-ins and payouts
- cross-border stablecoin payouts
- stablecoin-as-a-service for fintechs
- crypto-as-a-service payments
- stablecoin orchestration / conversion API
- regulated stablecoin payments provider

## Positioning — how the brand wants to be portrayed
(For the performance grader.)
The vocabulary Northwind Pay wants associated with it: **regulated**, **single API**, **pay-ins / payouts / conversions**, **stablecoin payment infrastructure**, **compliance built in**, **no custody / no licensing to build**, **cross-border**, **platform / PSP-grade**. Mission language: "Make moving dollars onchain as boring and reliable as a card transaction."

Its intended differentiator vs. the competitive set is being a **single regulated API that covers the full payment flow** — pay-in, payout, and conversion — with compliance embedded, aimed squarely at PSPs and fintechs rather than at enterprises issuing their own coin. The grader should expect Northwind Pay to want to be named in best-vendor and use-case answers about stablecoin payments / cross-border payouts, placed alongside payments-infrastructure peers like Bridge, Stripe, and Brale, and distinguished from issuers (Circle, Tether) and pure custody players (Fireblocks). Avoid framing it as a stablecoin issuer, an exchange, or a consumer wallet — those are wrong-category reads.

## Competitive set (share-of-voice)
- **Circle** — issuer of USDC plus an enterprise payments/wallet stack; the gravitational center of most "stablecoin infrastructure" answers, circle.com
- **Stripe / Bridge** — Bridge (acquired by Stripe) is the most-named full-stack stablecoin payments infrastructure for fintechs, bridge.xyz / stripe.com
- **Sphere** — stablecoin payments and settlement for businesses, strong in EMEA, sphere.fi
- **Fireblocks** — institutional custody + a payments/treasury layer, fireblocks.com
- **Brale** — cross-border B2B stablecoin payments / payouts, especially LatAm and Africa, brale.xyz
- **Zero Hash** — embedded crypto/stablecoin-as-a-service with licensing, zerohash.com
- **Crossmint** — full-stack wallet + payments + orchestration API, crossmint.com
- **Rain** — stablecoin issuance/treasury-as-a-service (adjacent, issuance-leaning), raincards.xyz

## Trust signals (fictional)
- **Regulation:** Operates as a registered money services business (FinCEN MSB) with a portfolio of U.S. state money transmitter licenses (claims 40+ states), and a NYDFS BitLicense. Custody is provided through a qualified third-party custodian; reserves and customer balances are segregated. SOC 2 Type II.
- **Funding:** ~$78M raised across Seed, Series A, and a 2025 Series B ($48M, led by a fictional fund "Meridian Capital," with participation from "Forefront Ventures" and angel operators from the payments world).
- **Named customers/partners (fictional):** mid-market PSPs and payout platforms — e.g. "Latitude Payments," "Harborline," "Tropic Remit," "Vela Marketplace." Powers cross-border payout flows for several remittance and creator-payout platforms.
- **People (fictional):** CEO & co-founder Dana Whitfield (ex-payments operator); CTO & co-founder Marcus Lindqvist (ex-infrastructure engineer).

## Pricing transparency
Largely gated / contact-sales. No public per-unit price list; the site routes to "Talk to sales" / "Get API keys." Some directional proof points appear in marketing (interchange-style per-transaction fee on payouts; FX spread on conversions; no minimum on the developer tier), but nothing structured on the core pages.

## Sources
> All URLs below are fictional/illustrative for the synthetic dataset; they do not resolve.
- [Northwind Pay — One API for stablecoin payments (homepage)](https://www.northwindpay.com/) — self-description, taglines, products
- [Northwind Pay — Company / About](https://www.northwindpay.com/company) — mission, ICP, founding year (2021), NYC, founders, funding
- [Northwind Pay — Payouts](https://www.northwindpay.com/payouts) — cross-border payout product, 40+ countries
- [Northwind Pay — Pay-ins](https://www.northwindpay.com/pay-ins) — stablecoin acceptance + fiat settlement
- [Northwind Pay — Conversions](https://www.northwindpay.com/conversions) — fiat ↔ stablecoin conversion API
- [Northwind Pay — Compliance & Licensing](https://www.northwindpay.com/compliance) — MSB, state MTLs, NYDFS BitLicense, SOC 2
- [Northwind Pay — Crunchbase](https://www.crunchbase.com/organization/northwind-pay) — funding rounds, investors, headcount
- [Northwind Pay — LinkedIn](https://www.linkedin.com/company/northwind-pay) — team, updates
