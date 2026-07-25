# Structured Logging

Reference notes covering how events are recorded for later inspection. Non-normative; the code is the source of truth and this page is a reading aid.

## Overview

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time.

### Section 1: logging behavior 1

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref logging.1.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref logging.1.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref logging.1.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref logging.1.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref logging.1.4)

- Invariant 1.a: the logging stage never mutates its input in place.
- Invariant 1.b: the logging stage is deterministic given the same inputs.
- Invariant 1.c: the logging stage surfaces a typed result, not a bare value.

```text
stage=logging step=1 mode=reference outcome=documented
```

### Section 2: logging behavior 2

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref logging.2.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref logging.2.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref logging.2.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref logging.2.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref logging.2.4)

- Invariant 2.a: the logging stage never mutates its input in place.
- Invariant 2.b: the logging stage is deterministic given the same inputs.
- Invariant 2.c: the logging stage surfaces a typed result, not a bare value.

```text
stage=logging step=2 mode=reference outcome=documented
```

### Section 3: logging behavior 3

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref logging.3.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref logging.3.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref logging.3.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref logging.3.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref logging.3.4)

- Invariant 3.a: the logging stage never mutates its input in place.
- Invariant 3.b: the logging stage is deterministic given the same inputs.
- Invariant 3.c: the logging stage surfaces a typed result, not a bare value.

```text
stage=logging step=3 mode=reference outcome=documented
```

### Section 4: logging behavior 4

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref logging.4.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref logging.4.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref logging.4.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref logging.4.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref logging.4.4)

- Invariant 4.a: the logging stage never mutates its input in place.
- Invariant 4.b: the logging stage is deterministic given the same inputs.
- Invariant 4.c: the logging stage surfaces a typed result, not a bare value.

```text
stage=logging step=4 mode=reference outcome=documented
```

### Section 5: logging behavior 5

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref logging.5.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref logging.5.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref logging.5.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref logging.5.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref logging.5.4)

- Invariant 5.a: the logging stage never mutates its input in place.
- Invariant 5.b: the logging stage is deterministic given the same inputs.
- Invariant 5.c: the logging stage surfaces a typed result, not a bare value.

```text
stage=logging step=5 mode=reference outcome=documented
```

### Section 6: logging behavior 6

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref logging.6.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref logging.6.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref logging.6.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref logging.6.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref logging.6.4)

- Invariant 6.a: the logging stage never mutates its input in place.
- Invariant 6.b: the logging stage is deterministic given the same inputs.
- Invariant 6.c: the logging stage surfaces a typed result, not a bare value.

```text
stage=logging step=6 mode=reference outcome=documented
```

### Section 7: logging behavior 7

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref logging.7.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref logging.7.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref logging.7.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref logging.7.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref logging.7.4)

- Invariant 7.a: the logging stage never mutates its input in place.
- Invariant 7.b: the logging stage is deterministic given the same inputs.
- Invariant 7.c: the logging stage surfaces a typed result, not a bare value.

```text
stage=logging step=7 mode=reference outcome=documented
```

### Section 8: logging behavior 8

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref logging.8.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref logging.8.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref logging.8.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref logging.8.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref logging.8.4)

- Invariant 8.a: the logging stage never mutates its input in place.
- Invariant 8.b: the logging stage is deterministic given the same inputs.
- Invariant 8.c: the logging stage surfaces a typed result, not a bare value.

```text
stage=logging step=8 mode=reference outcome=documented
```

### Section 9: logging behavior 9

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref logging.9.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref logging.9.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref logging.9.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref logging.9.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref logging.9.4)

- Invariant 9.a: the logging stage never mutates its input in place.
- Invariant 9.b: the logging stage is deterministic given the same inputs.
- Invariant 9.c: the logging stage surfaces a typed result, not a bare value.

```text
stage=logging step=9 mode=reference outcome=documented
```

### Section 10: logging behavior 10

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref logging.10.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref logging.10.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref logging.10.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref logging.10.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref logging.10.4)

- Invariant 10.a: the logging stage never mutates its input in place.
- Invariant 10.b: the logging stage is deterministic given the same inputs.
- Invariant 10.c: the logging stage surfaces a typed result, not a bare value.

```text
stage=logging step=10 mode=reference outcome=documented
```

### Section 11: logging behavior 11

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref logging.11.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref logging.11.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref logging.11.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref logging.11.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref logging.11.4)

- Invariant 11.a: the logging stage never mutates its input in place.
- Invariant 11.b: the logging stage is deterministic given the same inputs.
- Invariant 11.c: the logging stage surfaces a typed result, not a bare value.

```text
stage=logging step=11 mode=reference outcome=documented
```

### Section 12: logging behavior 12

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref logging.12.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref logging.12.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref logging.12.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref logging.12.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref logging.12.4)

- Invariant 12.a: the logging stage never mutates its input in place.
- Invariant 12.b: the logging stage is deterministic given the same inputs.
- Invariant 12.c: the logging stage surfaces a typed result, not a bare value.

```text
stage=logging step=12 mode=reference outcome=documented
```

### Section 13: logging behavior 13

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref logging.13.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref logging.13.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref logging.13.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref logging.13.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref logging.13.4)

- Invariant 13.a: the logging stage never mutates its input in place.
- Invariant 13.b: the logging stage is deterministic given the same inputs.
- Invariant 13.c: the logging stage surfaces a typed result, not a bare value.

```text
stage=logging step=13 mode=reference outcome=documented
```

### Section 14: logging behavior 14

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref logging.14.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref logging.14.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref logging.14.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref logging.14.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref logging.14.4)

- Invariant 14.a: the logging stage never mutates its input in place.
- Invariant 14.b: the logging stage is deterministic given the same inputs.
- Invariant 14.c: the logging stage surfaces a typed result, not a bare value.

```text
stage=logging step=14 mode=reference outcome=documented
```

### Section 15: logging behavior 15

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref logging.15.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref logging.15.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref logging.15.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref logging.15.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref logging.15.4)

- Invariant 15.a: the logging stage never mutates its input in place.
- Invariant 15.b: the logging stage is deterministic given the same inputs.
- Invariant 15.c: the logging stage surfaces a typed result, not a bare value.

```text
stage=logging step=15 mode=reference outcome=documented
```

### Section 16: logging behavior 16

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref logging.16.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref logging.16.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref logging.16.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref logging.16.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref logging.16.4)

- Invariant 16.a: the logging stage never mutates its input in place.
- Invariant 16.b: the logging stage is deterministic given the same inputs.
- Invariant 16.c: the logging stage surfaces a typed result, not a bare value.

```text
stage=logging step=16 mode=reference outcome=documented
```

### Section 17: logging behavior 17

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref logging.17.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref logging.17.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref logging.17.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref logging.17.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref logging.17.4)

- Invariant 17.a: the logging stage never mutates its input in place.
- Invariant 17.b: the logging stage is deterministic given the same inputs.
- Invariant 17.c: the logging stage surfaces a typed result, not a bare value.

```text
stage=logging step=17 mode=reference outcome=documented
```

### Section 18: logging behavior 18

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref logging.18.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref logging.18.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref logging.18.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref logging.18.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref logging.18.4)

- Invariant 18.a: the logging stage never mutates its input in place.
- Invariant 18.b: the logging stage is deterministic given the same inputs.
- Invariant 18.c: the logging stage surfaces a typed result, not a bare value.

```text
stage=logging step=18 mode=reference outcome=documented
```

### Section 19: logging behavior 19

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref logging.19.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref logging.19.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref logging.19.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref logging.19.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref logging.19.4)

- Invariant 19.a: the logging stage never mutates its input in place.
- Invariant 19.b: the logging stage is deterministic given the same inputs.
- Invariant 19.c: the logging stage surfaces a typed result, not a bare value.

```text
stage=logging step=19 mode=reference outcome=documented
```

### Section 20: logging behavior 20

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref logging.20.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref logging.20.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref logging.20.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref logging.20.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref logging.20.4)

- Invariant 20.a: the logging stage never mutates its input in place.
- Invariant 20.b: the logging stage is deterministic given the same inputs.
- Invariant 20.c: the logging stage surfaces a typed result, not a bare value.

```text
stage=logging step=20 mode=reference outcome=documented
```
