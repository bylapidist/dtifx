# Downstream integrations

Use this directory to capture any build outputs or automation hooks that distribute DTIF artifacts
to your consumers. Popular patterns include:

- generating platform modules or SDKs from the resolved artifacts under `dist/`
- syncing resolved tokens into documentation portals or design linting pipelines
- wiring CI workflows that validate, generate, and audit DTIF assets on every change

Create additional folders under `integrations/` as you connect DTIFx to your delivery targets.
