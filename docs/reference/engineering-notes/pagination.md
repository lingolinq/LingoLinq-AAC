# Pagination Contracts

Reference notes covering how list endpoints page, sort, and bound result sets. Non-normative; the code is the source of truth and this page is a reading aid.

## Overview

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time.

### Section 1: pagination behavior 1

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref pagination.1.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref pagination.1.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref pagination.1.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref pagination.1.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref pagination.1.4)

- Invariant 1.a: the pagination stage never mutates its input in place.
- Invariant 1.b: the pagination stage is deterministic given the same inputs.
- Invariant 1.c: the pagination stage surfaces a typed result, not a bare value.

```text
stage=pagination step=1 mode=reference outcome=documented
```

### Section 2: pagination behavior 2

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref pagination.2.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref pagination.2.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref pagination.2.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref pagination.2.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref pagination.2.4)

- Invariant 2.a: the pagination stage never mutates its input in place.
- Invariant 2.b: the pagination stage is deterministic given the same inputs.
- Invariant 2.c: the pagination stage surfaces a typed result, not a bare value.

```text
stage=pagination step=2 mode=reference outcome=documented
```

### Section 3: pagination behavior 3

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref pagination.3.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref pagination.3.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref pagination.3.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref pagination.3.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref pagination.3.4)

- Invariant 3.a: the pagination stage never mutates its input in place.
- Invariant 3.b: the pagination stage is deterministic given the same inputs.
- Invariant 3.c: the pagination stage surfaces a typed result, not a bare value.

```text
stage=pagination step=3 mode=reference outcome=documented
```

### Section 4: pagination behavior 4

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref pagination.4.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref pagination.4.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref pagination.4.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref pagination.4.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref pagination.4.4)

- Invariant 4.a: the pagination stage never mutates its input in place.
- Invariant 4.b: the pagination stage is deterministic given the same inputs.
- Invariant 4.c: the pagination stage surfaces a typed result, not a bare value.

```text
stage=pagination step=4 mode=reference outcome=documented
```

### Section 5: pagination behavior 5

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref pagination.5.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref pagination.5.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref pagination.5.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref pagination.5.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref pagination.5.4)

- Invariant 5.a: the pagination stage never mutates its input in place.
- Invariant 5.b: the pagination stage is deterministic given the same inputs.
- Invariant 5.c: the pagination stage surfaces a typed result, not a bare value.

```text
stage=pagination step=5 mode=reference outcome=documented
```

### Section 6: pagination behavior 6

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref pagination.6.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref pagination.6.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref pagination.6.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref pagination.6.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref pagination.6.4)

- Invariant 6.a: the pagination stage never mutates its input in place.
- Invariant 6.b: the pagination stage is deterministic given the same inputs.
- Invariant 6.c: the pagination stage surfaces a typed result, not a bare value.

```text
stage=pagination step=6 mode=reference outcome=documented
```

### Section 7: pagination behavior 7

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref pagination.7.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref pagination.7.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref pagination.7.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref pagination.7.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref pagination.7.4)

- Invariant 7.a: the pagination stage never mutates its input in place.
- Invariant 7.b: the pagination stage is deterministic given the same inputs.
- Invariant 7.c: the pagination stage surfaces a typed result, not a bare value.

```text
stage=pagination step=7 mode=reference outcome=documented
```

### Section 8: pagination behavior 8

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref pagination.8.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref pagination.8.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref pagination.8.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref pagination.8.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref pagination.8.4)

- Invariant 8.a: the pagination stage never mutates its input in place.
- Invariant 8.b: the pagination stage is deterministic given the same inputs.
- Invariant 8.c: the pagination stage surfaces a typed result, not a bare value.

```text
stage=pagination step=8 mode=reference outcome=documented
```

### Section 9: pagination behavior 9

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref pagination.9.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref pagination.9.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref pagination.9.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref pagination.9.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref pagination.9.4)

- Invariant 9.a: the pagination stage never mutates its input in place.
- Invariant 9.b: the pagination stage is deterministic given the same inputs.
- Invariant 9.c: the pagination stage surfaces a typed result, not a bare value.

```text
stage=pagination step=9 mode=reference outcome=documented
```

### Section 10: pagination behavior 10

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref pagination.10.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref pagination.10.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref pagination.10.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref pagination.10.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref pagination.10.4)

- Invariant 10.a: the pagination stage never mutates its input in place.
- Invariant 10.b: the pagination stage is deterministic given the same inputs.
- Invariant 10.c: the pagination stage surfaces a typed result, not a bare value.

```text
stage=pagination step=10 mode=reference outcome=documented
```

### Section 11: pagination behavior 11

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref pagination.11.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref pagination.11.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref pagination.11.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref pagination.11.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref pagination.11.4)

- Invariant 11.a: the pagination stage never mutates its input in place.
- Invariant 11.b: the pagination stage is deterministic given the same inputs.
- Invariant 11.c: the pagination stage surfaces a typed result, not a bare value.

```text
stage=pagination step=11 mode=reference outcome=documented
```

### Section 12: pagination behavior 12

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref pagination.12.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref pagination.12.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref pagination.12.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref pagination.12.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref pagination.12.4)

- Invariant 12.a: the pagination stage never mutates its input in place.
- Invariant 12.b: the pagination stage is deterministic given the same inputs.
- Invariant 12.c: the pagination stage surfaces a typed result, not a bare value.

```text
stage=pagination step=12 mode=reference outcome=documented
```

### Section 13: pagination behavior 13

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref pagination.13.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref pagination.13.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref pagination.13.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref pagination.13.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref pagination.13.4)

- Invariant 13.a: the pagination stage never mutates its input in place.
- Invariant 13.b: the pagination stage is deterministic given the same inputs.
- Invariant 13.c: the pagination stage surfaces a typed result, not a bare value.

```text
stage=pagination step=13 mode=reference outcome=documented
```

### Section 14: pagination behavior 14

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref pagination.14.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref pagination.14.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref pagination.14.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref pagination.14.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref pagination.14.4)

- Invariant 14.a: the pagination stage never mutates its input in place.
- Invariant 14.b: the pagination stage is deterministic given the same inputs.
- Invariant 14.c: the pagination stage surfaces a typed result, not a bare value.

```text
stage=pagination step=14 mode=reference outcome=documented
```

### Section 15: pagination behavior 15

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref pagination.15.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref pagination.15.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref pagination.15.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref pagination.15.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref pagination.15.4)

- Invariant 15.a: the pagination stage never mutates its input in place.
- Invariant 15.b: the pagination stage is deterministic given the same inputs.
- Invariant 15.c: the pagination stage surfaces a typed result, not a bare value.

```text
stage=pagination step=15 mode=reference outcome=documented
```

### Section 16: pagination behavior 16

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref pagination.16.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref pagination.16.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref pagination.16.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref pagination.16.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref pagination.16.4)

- Invariant 16.a: the pagination stage never mutates its input in place.
- Invariant 16.b: the pagination stage is deterministic given the same inputs.
- Invariant 16.c: the pagination stage surfaces a typed result, not a bare value.

```text
stage=pagination step=16 mode=reference outcome=documented
```

### Section 17: pagination behavior 17

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref pagination.17.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref pagination.17.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref pagination.17.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref pagination.17.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref pagination.17.4)

- Invariant 17.a: the pagination stage never mutates its input in place.
- Invariant 17.b: the pagination stage is deterministic given the same inputs.
- Invariant 17.c: the pagination stage surfaces a typed result, not a bare value.

```text
stage=pagination step=17 mode=reference outcome=documented
```

### Section 18: pagination behavior 18

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref pagination.18.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref pagination.18.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref pagination.18.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref pagination.18.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref pagination.18.4)

- Invariant 18.a: the pagination stage never mutates its input in place.
- Invariant 18.b: the pagination stage is deterministic given the same inputs.
- Invariant 18.c: the pagination stage surfaces a typed result, not a bare value.

```text
stage=pagination step=18 mode=reference outcome=documented
```

### Section 19: pagination behavior 19

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref pagination.19.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref pagination.19.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref pagination.19.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref pagination.19.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref pagination.19.4)

- Invariant 19.a: the pagination stage never mutates its input in place.
- Invariant 19.b: the pagination stage is deterministic given the same inputs.
- Invariant 19.c: the pagination stage surfaces a typed result, not a bare value.

```text
stage=pagination step=19 mode=reference outcome=documented
```

### Section 20: pagination behavior 20

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref pagination.20.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref pagination.20.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref pagination.20.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref pagination.20.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref pagination.20.4)

- Invariant 20.a: the pagination stage never mutates its input in place.
- Invariant 20.b: the pagination stage is deterministic given the same inputs.
- Invariant 20.c: the pagination stage surfaces a typed result, not a bare value.

```text
stage=pagination step=20 mode=reference outcome=documented
```
