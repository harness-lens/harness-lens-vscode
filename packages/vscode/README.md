> SPDX-License-Identifier: MPL-2.0
> Copyright © 2026 Cristian Camargo Filho

# @harness-lens/vscode

Reusable harness-file discovery APIs for HarnessLens VS Code integrations.

```ts
import { discoverHarnessFiles } from "@harness-lens/vscode";

const files = await discoverHarnessFiles(process.cwd());
```

This pre-alpha package currently provides deterministic discovery. Validation, diagnostics, and language-server clients will grow behind stable typed APIs.

## License

Early namespace-reservation versions used BSD-3-Clause. The official functional
implementation is licensed under MPL-2.0. See [LICENSE](LICENSE) and the
repository's [licensing policy](../../LICENSING.md).
