# Timeout Budgets

Reference notes covering how request time budgets are allocated across stages. Non-normative; the code is the source of truth and this page is a reading aid.

## Overview

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time.

### Section 1: timeouts behavior 1

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref timeouts.1.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref timeouts.1.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref timeouts.1.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref timeouts.1.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref timeouts.1.4)

- Invariant 1.a: the timeouts stage never mutates its input in place.
- Invariant 1.b: the timeouts stage is deterministic given the same inputs.
- Invariant 1.c: the timeouts stage surfaces a typed result, not a bare value.

```text
stage=timeouts step=1 mode=reference outcome=documented
```

### Section 2: timeouts behavior 2

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref timeouts.2.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref timeouts.2.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref timeouts.2.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref timeouts.2.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref timeouts.2.4)

- Invariant 2.a: the timeouts stage never mutates its input in place.
- Invariant 2.b: the timeouts stage is deterministic given the same inputs.
- Invariant 2.c: the timeouts stage surfaces a typed result, not a bare value.

```text
stage=timeouts step=2 mode=reference outcome=documented
```

### Section 3: timeouts behavior 3

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref timeouts.3.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref timeouts.3.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref timeouts.3.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref timeouts.3.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref timeouts.3.4)

- Invariant 3.a: the timeouts stage never mutates its input in place.
- Invariant 3.b: the timeouts stage is deterministic given the same inputs.
- Invariant 3.c: the timeouts stage surfaces a typed result, not a bare value.

```text
stage=timeouts step=3 mode=reference outcome=documented
```

### Section 4: timeouts behavior 4

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref timeouts.4.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref timeouts.4.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref timeouts.4.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref timeouts.4.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref timeouts.4.4)

- Invariant 4.a: the timeouts stage never mutates its input in place.
- Invariant 4.b: the timeouts stage is deterministic given the same inputs.
- Invariant 4.c: the timeouts stage surfaces a typed result, not a bare value.

```text
stage=timeouts step=4 mode=reference outcome=documented
```

### Section 5: timeouts behavior 5

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref timeouts.5.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref timeouts.5.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref timeouts.5.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref timeouts.5.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref timeouts.5.4)

- Invariant 5.a: the timeouts stage never mutates its input in place.
- Invariant 5.b: the timeouts stage is deterministic given the same inputs.
- Invariant 5.c: the timeouts stage surfaces a typed result, not a bare value.

```text
stage=timeouts step=5 mode=reference outcome=documented
```

### Section 6: timeouts behavior 6

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref timeouts.6.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref timeouts.6.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref timeouts.6.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref timeouts.6.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref timeouts.6.4)

- Invariant 6.a: the timeouts stage never mutates its input in place.
- Invariant 6.b: the timeouts stage is deterministic given the same inputs.
- Invariant 6.c: the timeouts stage surfaces a typed result, not a bare value.

```text
stage=timeouts step=6 mode=reference outcome=documented
```

### Section 7: timeouts behavior 7

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref timeouts.7.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref timeouts.7.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref timeouts.7.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref timeouts.7.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref timeouts.7.4)

- Invariant 7.a: the timeouts stage never mutates its input in place.
- Invariant 7.b: the timeouts stage is deterministic given the same inputs.
- Invariant 7.c: the timeouts stage surfaces a typed result, not a bare value.

```text
stage=timeouts step=7 mode=reference outcome=documented
```

### Section 8: timeouts behavior 8

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref timeouts.8.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref timeouts.8.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref timeouts.8.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref timeouts.8.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref timeouts.8.4)

- Invariant 8.a: the timeouts stage never mutates its input in place.
- Invariant 8.b: the timeouts stage is deterministic given the same inputs.
- Invariant 8.c: the timeouts stage surfaces a typed result, not a bare value.

```text
stage=timeouts step=8 mode=reference outcome=documented
```

### Section 9: timeouts behavior 9

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref timeouts.9.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref timeouts.9.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref timeouts.9.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref timeouts.9.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref timeouts.9.4)

- Invariant 9.a: the timeouts stage never mutates its input in place.
- Invariant 9.b: the timeouts stage is deterministic given the same inputs.
- Invariant 9.c: the timeouts stage surfaces a typed result, not a bare value.

```text
stage=timeouts step=9 mode=reference outcome=documented
```

### Section 10: timeouts behavior 10

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref timeouts.10.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref timeouts.10.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref timeouts.10.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref timeouts.10.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref timeouts.10.4)

- Invariant 10.a: the timeouts stage never mutates its input in place.
- Invariant 10.b: the timeouts stage is deterministic given the same inputs.
- Invariant 10.c: the timeouts stage surfaces a typed result, not a bare value.

```text
stage=timeouts step=10 mode=reference outcome=documented
```

### Section 11: timeouts behavior 11

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref timeouts.11.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref timeouts.11.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref timeouts.11.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref timeouts.11.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref timeouts.11.4)

- Invariant 11.a: the timeouts stage never mutates its input in place.
- Invariant 11.b: the timeouts stage is deterministic given the same inputs.
- Invariant 11.c: the timeouts stage surfaces a typed result, not a bare value.

```text
stage=timeouts step=11 mode=reference outcome=documented
```

### Section 12: timeouts behavior 12

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref timeouts.12.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref timeouts.12.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref timeouts.12.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref timeouts.12.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref timeouts.12.4)

- Invariant 12.a: the timeouts stage never mutates its input in place.
- Invariant 12.b: the timeouts stage is deterministic given the same inputs.
- Invariant 12.c: the timeouts stage surfaces a typed result, not a bare value.

```text
stage=timeouts step=12 mode=reference outcome=documented
```

### Section 13: timeouts behavior 13

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref timeouts.13.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref timeouts.13.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref timeouts.13.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref timeouts.13.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref timeouts.13.4)

- Invariant 13.a: the timeouts stage never mutates its input in place.
- Invariant 13.b: the timeouts stage is deterministic given the same inputs.
- Invariant 13.c: the timeouts stage surfaces a typed result, not a bare value.

```text
stage=timeouts step=13 mode=reference outcome=documented
```

### Section 14: timeouts behavior 14

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref timeouts.14.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref timeouts.14.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref timeouts.14.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref timeouts.14.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref timeouts.14.4)

- Invariant 14.a: the timeouts stage never mutates its input in place.
- Invariant 14.b: the timeouts stage is deterministic given the same inputs.
- Invariant 14.c: the timeouts stage surfaces a typed result, not a bare value.

```text
stage=timeouts step=14 mode=reference outcome=documented
```

### Section 15: timeouts behavior 15

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref timeouts.15.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref timeouts.15.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref timeouts.15.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref timeouts.15.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref timeouts.15.4)

- Invariant 15.a: the timeouts stage never mutates its input in place.
- Invariant 15.b: the timeouts stage is deterministic given the same inputs.
- Invariant 15.c: the timeouts stage surfaces a typed result, not a bare value.

```text
stage=timeouts step=15 mode=reference outcome=documented
```

### Section 16: timeouts behavior 16

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref timeouts.16.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref timeouts.16.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref timeouts.16.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref timeouts.16.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref timeouts.16.4)

- Invariant 16.a: the timeouts stage never mutates its input in place.
- Invariant 16.b: the timeouts stage is deterministic given the same inputs.
- Invariant 16.c: the timeouts stage surfaces a typed result, not a bare value.

```text
stage=timeouts step=16 mode=reference outcome=documented
```

### Section 17: timeouts behavior 17

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref timeouts.17.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref timeouts.17.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref timeouts.17.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref timeouts.17.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref timeouts.17.4)

- Invariant 17.a: the timeouts stage never mutates its input in place.
- Invariant 17.b: the timeouts stage is deterministic given the same inputs.
- Invariant 17.c: the timeouts stage surfaces a typed result, not a bare value.

```text
stage=timeouts step=17 mode=reference outcome=documented
```

### Section 18: timeouts behavior 18

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref timeouts.18.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref timeouts.18.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref timeouts.18.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref timeouts.18.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref timeouts.18.4)

- Invariant 18.a: the timeouts stage never mutates its input in place.
- Invariant 18.b: the timeouts stage is deterministic given the same inputs.
- Invariant 18.c: the timeouts stage surfaces a typed result, not a bare value.

```text
stage=timeouts step=18 mode=reference outcome=documented
```

### Section 19: timeouts behavior 19

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref timeouts.19.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref timeouts.19.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref timeouts.19.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref timeouts.19.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref timeouts.19.4)

- Invariant 19.a: the timeouts stage never mutates its input in place.
- Invariant 19.b: the timeouts stage is deterministic given the same inputs.
- Invariant 19.c: the timeouts stage surfaces a typed result, not a bare value.

```text
stage=timeouts step=19 mode=reference outcome=documented
```

### Section 20: timeouts behavior 20

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref timeouts.20.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref timeouts.20.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref timeouts.20.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref timeouts.20.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref timeouts.20.4)

- Invariant 20.a: the timeouts stage never mutates its input in place.
- Invariant 20.b: the timeouts stage is deterministic given the same inputs.
- Invariant 20.c: the timeouts stage surfaces a typed result, not a bare value.

```text
stage=timeouts step=20 mode=reference outcome=documented
```
