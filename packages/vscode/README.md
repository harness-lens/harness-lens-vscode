# @harness-lens/vscode

Reusable harness-file discovery APIs for HarnessLens VS Code integrations.

```ts
import { discoverHarnessFiles } from "@harness-lens/vscode";

const files = await discoverHarnessFiles(process.cwd());
```

This pre-alpha package currently provides deterministic discovery. Validation, diagnostics, and language-server clients will grow behind stable typed APIs.
