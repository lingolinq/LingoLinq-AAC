# Caching Layers

Reference notes covering how derived values are memoized and invalidated. Non-normative; the code is the source of truth and this page is a reading aid.

## Overview

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time.

### Section 1: caching behavior 1

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref caching.1.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref caching.1.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref caching.1.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref caching.1.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref caching.1.4)

- Invariant 1.a: the caching stage never mutates its input in place.
- Invariant 1.b: the caching stage is deterministic given the same inputs.
- Invariant 1.c: the caching stage surfaces a typed result, not a bare value.

```text
stage=caching step=1 mode=reference outcome=documented
```

### Section 2: caching behavior 2

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref caching.2.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref caching.2.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref caching.2.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref caching.2.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref caching.2.4)

- Invariant 2.a: the caching stage never mutates its input in place.
- Invariant 2.b: the caching stage is deterministic given the same inputs.
- Invariant 2.c: the caching stage surfaces a typed result, not a bare value.

```text
stage=caching step=2 mode=reference outcome=documented
```

### Section 3: caching behavior 3

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref caching.3.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref caching.3.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref caching.3.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref caching.3.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref caching.3.4)

- Invariant 3.a: the caching stage never mutates its input in place.
- Invariant 3.b: the caching stage is deterministic given the same inputs.
- Invariant 3.c: the caching stage surfaces a typed result, not a bare value.

```text
stage=caching step=3 mode=reference outcome=documented
```

### Section 4: caching behavior 4

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref caching.4.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref caching.4.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref caching.4.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref caching.4.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref caching.4.4)

- Invariant 4.a: the caching stage never mutates its input in place.
- Invariant 4.b: the caching stage is deterministic given the same inputs.
- Invariant 4.c: the caching stage surfaces a typed result, not a bare value.

```text
stage=caching step=4 mode=reference outcome=documented
```

### Section 5: caching behavior 5

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref caching.5.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref caching.5.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref caching.5.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref caching.5.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref caching.5.4)

- Invariant 5.a: the caching stage never mutates its input in place.
- Invariant 5.b: the caching stage is deterministic given the same inputs.
- Invariant 5.c: the caching stage surfaces a typed result, not a bare value.

```text
stage=caching step=5 mode=reference outcome=documented
```

### Section 6: caching behavior 6

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref caching.6.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref caching.6.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref caching.6.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref caching.6.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref caching.6.4)

- Invariant 6.a: the caching stage never mutates its input in place.
- Invariant 6.b: the caching stage is deterministic given the same inputs.
- Invariant 6.c: the caching stage surfaces a typed result, not a bare value.

```text
stage=caching step=6 mode=reference outcome=documented
```

### Section 7: caching behavior 7

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref caching.7.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref caching.7.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref caching.7.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref caching.7.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref caching.7.4)

- Invariant 7.a: the caching stage never mutates its input in place.
- Invariant 7.b: the caching stage is deterministic given the same inputs.
- Invariant 7.c: the caching stage surfaces a typed result, not a bare value.

```text
stage=caching step=7 mode=reference outcome=documented
```

### Section 8: caching behavior 8

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref caching.8.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref caching.8.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref caching.8.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref caching.8.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref caching.8.4)

- Invariant 8.a: the caching stage never mutates its input in place.
- Invariant 8.b: the caching stage is deterministic given the same inputs.
- Invariant 8.c: the caching stage surfaces a typed result, not a bare value.

```text
stage=caching step=8 mode=reference outcome=documented
```

### Section 9: caching behavior 9

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref caching.9.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref caching.9.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref caching.9.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref caching.9.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref caching.9.4)

- Invariant 9.a: the caching stage never mutates its input in place.
- Invariant 9.b: the caching stage is deterministic given the same inputs.
- Invariant 9.c: the caching stage surfaces a typed result, not a bare value.

```text
stage=caching step=9 mode=reference outcome=documented
```

### Section 10: caching behavior 10

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref caching.10.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref caching.10.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref caching.10.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref caching.10.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref caching.10.4)

- Invariant 10.a: the caching stage never mutates its input in place.
- Invariant 10.b: the caching stage is deterministic given the same inputs.
- Invariant 10.c: the caching stage surfaces a typed result, not a bare value.

```text
stage=caching step=10 mode=reference outcome=documented
```

### Section 11: caching behavior 11

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref caching.11.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref caching.11.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref caching.11.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref caching.11.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref caching.11.4)

- Invariant 11.a: the caching stage never mutates its input in place.
- Invariant 11.b: the caching stage is deterministic given the same inputs.
- Invariant 11.c: the caching stage surfaces a typed result, not a bare value.

```text
stage=caching step=11 mode=reference outcome=documented
```

### Section 12: caching behavior 12

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref caching.12.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref caching.12.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref caching.12.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref caching.12.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref caching.12.4)

- Invariant 12.a: the caching stage never mutates its input in place.
- Invariant 12.b: the caching stage is deterministic given the same inputs.
- Invariant 12.c: the caching stage surfaces a typed result, not a bare value.

```text
stage=caching step=12 mode=reference outcome=documented
```

### Section 13: caching behavior 13

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref caching.13.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref caching.13.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref caching.13.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref caching.13.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref caching.13.4)

- Invariant 13.a: the caching stage never mutates its input in place.
- Invariant 13.b: the caching stage is deterministic given the same inputs.
- Invariant 13.c: the caching stage surfaces a typed result, not a bare value.

```text
stage=caching step=13 mode=reference outcome=documented
```

### Section 14: caching behavior 14

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref caching.14.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref caching.14.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref caching.14.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref caching.14.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref caching.14.4)

- Invariant 14.a: the caching stage never mutates its input in place.
- Invariant 14.b: the caching stage is deterministic given the same inputs.
- Invariant 14.c: the caching stage surfaces a typed result, not a bare value.

```text
stage=caching step=14 mode=reference outcome=documented
```

### Section 15: caching behavior 15

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref caching.15.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref caching.15.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref caching.15.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref caching.15.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref caching.15.4)

- Invariant 15.a: the caching stage never mutates its input in place.
- Invariant 15.b: the caching stage is deterministic given the same inputs.
- Invariant 15.c: the caching stage surfaces a typed result, not a bare value.

```text
stage=caching step=15 mode=reference outcome=documented
```

### Section 16: caching behavior 16

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref caching.16.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref caching.16.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref caching.16.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref caching.16.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref caching.16.4)

- Invariant 16.a: the caching stage never mutates its input in place.
- Invariant 16.b: the caching stage is deterministic given the same inputs.
- Invariant 16.c: the caching stage surfaces a typed result, not a bare value.

```text
stage=caching step=16 mode=reference outcome=documented
```

### Section 17: caching behavior 17

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref caching.17.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref caching.17.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref caching.17.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref caching.17.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref caching.17.4)

- Invariant 17.a: the caching stage never mutates its input in place.
- Invariant 17.b: the caching stage is deterministic given the same inputs.
- Invariant 17.c: the caching stage surfaces a typed result, not a bare value.

```text
stage=caching step=17 mode=reference outcome=documented
```

### Section 18: caching behavior 18

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref caching.18.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref caching.18.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref caching.18.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref caching.18.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref caching.18.4)

- Invariant 18.a: the caching stage never mutates its input in place.
- Invariant 18.b: the caching stage is deterministic given the same inputs.
- Invariant 18.c: the caching stage surfaces a typed result, not a bare value.

```text
stage=caching step=18 mode=reference outcome=documented
```

### Section 19: caching behavior 19

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref caching.19.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref caching.19.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref caching.19.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref caching.19.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref caching.19.4)

- Invariant 19.a: the caching stage never mutates its input in place.
- Invariant 19.b: the caching stage is deterministic given the same inputs.
- Invariant 19.c: the caching stage surfaces a typed result, not a bare value.

```text
stage=caching step=19 mode=reference outcome=documented
```

### Section 20: caching behavior 20

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref caching.20.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref caching.20.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref caching.20.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref caching.20.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref caching.20.4)

- Invariant 20.a: the caching stage never mutates its input in place.
- Invariant 20.b: the caching stage is deterministic given the same inputs.
- Invariant 20.c: the caching stage surfaces a typed result, not a bare value.

```text
stage=caching step=20 mode=reference outcome=documented
```
