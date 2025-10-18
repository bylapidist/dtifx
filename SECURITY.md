# Security Policy

We take the security of the DTIFx ecosystem seriously and appreciate responsible reports that help
protect our users. This document explains how to submit vulnerability reports, what information to
include, and how we respond.

## Supported versions

Security patches are applied to the `main` branch and released as part of the next published version
of affected packages. We do not maintain long-term support branches; please upgrade to the latest
release to receive fixes.

## Reporting a vulnerability

- Email [hello@lapidist.net](mailto:hello@lapidist.net) with the subject line "DTIFx Security".
- Provide a detailed description of the issue, including reproduction steps, affected packages,
  potential impact, and any proofs of concept.
- Encrypt reports with our PGP key when possible (key fingerprint: `0xD7A5 9F42 1BC4 2D87`).
- Please allow at least 48 hours for an initial response. We will coordinate further investigation
  over email.

## Handling process

1. We acknowledge receipt of the report and open a private issue for triage.
2. Maintainers reproduce the vulnerability and assess impact and severity.
3. We develop and validate a fix, ensuring automated tests and the required quality gates succeed.
4. Coordinated disclosure timing is agreed upon with the reporter. We strive to release fixes within
   30 days of confirmation for high-severity issues.
5. Once resolved, we publish a security advisory and credit reporters who request acknowledgement.

## Scope

Please limit testing to your own environments. Do not perform denial-of-service attacks or access
other users' data without permission. Out-of-scope reports include social engineering, phishing, and
issues in third-party dependencies outside our control unless they demonstrably impact DTIFx.

## Preferred languages

We accept reports in English.
