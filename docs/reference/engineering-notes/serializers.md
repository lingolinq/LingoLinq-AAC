# Serialization Shapes

Reference notes covering how domain objects are projected into response bodies. Non-normative; the code is the source of truth and this page is a reading aid.

## Overview

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time.

### Section 1: serializers behavior 1

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref serializers.1.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref serializers.1.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref serializers.1.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref serializers.1.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref serializers.1.4)

- Invariant 1.a: the serializers stage never mutates its input in place.
- Invariant 1.b: the serializers stage is deterministic given the same inputs.
- Invariant 1.c: the serializers stage surfaces a typed result, not a bare value.

```text
stage=serializers step=1 mode=reference outcome=documented
```

### Section 2: serializers behavior 2

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref serializers.2.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref serializers.2.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref serializers.2.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref serializers.2.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref serializers.2.4)

- Invariant 2.a: the serializers stage never mutates its input in place.
- Invariant 2.b: the serializers stage is deterministic given the same inputs.
- Invariant 2.c: the serializers stage surfaces a typed result, not a bare value.

```text
stage=serializers step=2 mode=reference outcome=documented
```

### Section 3: serializers behavior 3

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref serializers.3.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref serializers.3.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref serializers.3.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref serializers.3.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref serializers.3.4)

- Invariant 3.a: the serializers stage never mutates its input in place.
- Invariant 3.b: the serializers stage is deterministic given the same inputs.
- Invariant 3.c: the serializers stage surfaces a typed result, not a bare value.

```text
stage=serializers step=3 mode=reference outcome=documented
```

### Section 4: serializers behavior 4

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref serializers.4.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref serializers.4.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref serializers.4.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref serializers.4.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref serializers.4.4)

- Invariant 4.a: the serializers stage never mutates its input in place.
- Invariant 4.b: the serializers stage is deterministic given the same inputs.
- Invariant 4.c: the serializers stage surfaces a typed result, not a bare value.

```text
stage=serializers step=4 mode=reference outcome=documented
```

### Section 5: serializers behavior 5

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref serializers.5.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref serializers.5.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref serializers.5.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref serializers.5.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref serializers.5.4)

- Invariant 5.a: the serializers stage never mutates its input in place.
- Invariant 5.b: the serializers stage is deterministic given the same inputs.
- Invariant 5.c: the serializers stage surfaces a typed result, not a bare value.

```text
stage=serializers step=5 mode=reference outcome=documented
```

### Section 6: serializers behavior 6

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref serializers.6.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref serializers.6.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref serializers.6.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref serializers.6.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref serializers.6.4)

- Invariant 6.a: the serializers stage never mutates its input in place.
- Invariant 6.b: the serializers stage is deterministic given the same inputs.
- Invariant 6.c: the serializers stage surfaces a typed result, not a bare value.

```text
stage=serializers step=6 mode=reference outcome=documented
```

### Section 7: serializers behavior 7

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref serializers.7.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref serializers.7.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref serializers.7.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref serializers.7.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref serializers.7.4)

- Invariant 7.a: the serializers stage never mutates its input in place.
- Invariant 7.b: the serializers stage is deterministic given the same inputs.
- Invariant 7.c: the serializers stage surfaces a typed result, not a bare value.

```text
stage=serializers step=7 mode=reference outcome=documented
```

### Section 8: serializers behavior 8

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref serializers.8.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref serializers.8.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref serializers.8.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref serializers.8.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref serializers.8.4)

- Invariant 8.a: the serializers stage never mutates its input in place.
- Invariant 8.b: the serializers stage is deterministic given the same inputs.
- Invariant 8.c: the serializers stage surfaces a typed result, not a bare value.

```text
stage=serializers step=8 mode=reference outcome=documented
```

### Section 9: serializers behavior 9

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref serializers.9.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref serializers.9.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref serializers.9.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref serializers.9.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref serializers.9.4)

- Invariant 9.a: the serializers stage never mutates its input in place.
- Invariant 9.b: the serializers stage is deterministic given the same inputs.
- Invariant 9.c: the serializers stage surfaces a typed result, not a bare value.

```text
stage=serializers step=9 mode=reference outcome=documented
```

### Section 10: serializers behavior 10

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref serializers.10.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref serializers.10.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref serializers.10.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref serializers.10.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref serializers.10.4)

- Invariant 10.a: the serializers stage never mutates its input in place.
- Invariant 10.b: the serializers stage is deterministic given the same inputs.
- Invariant 10.c: the serializers stage surfaces a typed result, not a bare value.

```text
stage=serializers step=10 mode=reference outcome=documented
```

### Section 11: serializers behavior 11

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref serializers.11.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref serializers.11.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref serializers.11.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref serializers.11.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref serializers.11.4)

- Invariant 11.a: the serializers stage never mutates its input in place.
- Invariant 11.b: the serializers stage is deterministic given the same inputs.
- Invariant 11.c: the serializers stage surfaces a typed result, not a bare value.

```text
stage=serializers step=11 mode=reference outcome=documented
```

### Section 12: serializers behavior 12

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref serializers.12.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref serializers.12.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref serializers.12.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref serializers.12.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref serializers.12.4)

- Invariant 12.a: the serializers stage never mutates its input in place.
- Invariant 12.b: the serializers stage is deterministic given the same inputs.
- Invariant 12.c: the serializers stage surfaces a typed result, not a bare value.

```text
stage=serializers step=12 mode=reference outcome=documented
```

### Section 13: serializers behavior 13

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref serializers.13.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref serializers.13.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref serializers.13.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref serializers.13.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref serializers.13.4)

- Invariant 13.a: the serializers stage never mutates its input in place.
- Invariant 13.b: the serializers stage is deterministic given the same inputs.
- Invariant 13.c: the serializers stage surfaces a typed result, not a bare value.

```text
stage=serializers step=13 mode=reference outcome=documented
```

### Section 14: serializers behavior 14

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref serializers.14.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref serializers.14.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref serializers.14.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref serializers.14.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref serializers.14.4)

- Invariant 14.a: the serializers stage never mutates its input in place.
- Invariant 14.b: the serializers stage is deterministic given the same inputs.
- Invariant 14.c: the serializers stage surfaces a typed result, not a bare value.

```text
stage=serializers step=14 mode=reference outcome=documented
```

### Section 15: serializers behavior 15

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref serializers.15.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref serializers.15.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref serializers.15.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref serializers.15.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref serializers.15.4)

- Invariant 15.a: the serializers stage never mutates its input in place.
- Invariant 15.b: the serializers stage is deterministic given the same inputs.
- Invariant 15.c: the serializers stage surfaces a typed result, not a bare value.

```text
stage=serializers step=15 mode=reference outcome=documented
```

### Section 16: serializers behavior 16

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref serializers.16.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref serializers.16.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref serializers.16.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref serializers.16.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref serializers.16.4)

- Invariant 16.a: the serializers stage never mutates its input in place.
- Invariant 16.b: the serializers stage is deterministic given the same inputs.
- Invariant 16.c: the serializers stage surfaces a typed result, not a bare value.

```text
stage=serializers step=16 mode=reference outcome=documented
```

### Section 17: serializers behavior 17

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref serializers.17.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref serializers.17.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref serializers.17.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref serializers.17.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref serializers.17.4)

- Invariant 17.a: the serializers stage never mutates its input in place.
- Invariant 17.b: the serializers stage is deterministic given the same inputs.
- Invariant 17.c: the serializers stage surfaces a typed result, not a bare value.

```text
stage=serializers step=17 mode=reference outcome=documented
```

### Section 18: serializers behavior 18

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref serializers.18.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref serializers.18.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref serializers.18.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref serializers.18.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref serializers.18.4)

- Invariant 18.a: the serializers stage never mutates its input in place.
- Invariant 18.b: the serializers stage is deterministic given the same inputs.
- Invariant 18.c: the serializers stage surfaces a typed result, not a bare value.

```text
stage=serializers step=18 mode=reference outcome=documented
```

### Section 19: serializers behavior 19

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref serializers.19.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref serializers.19.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref serializers.19.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref serializers.19.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref serializers.19.4)

- Invariant 19.a: the serializers stage never mutates its input in place.
- Invariant 19.b: the serializers stage is deterministic given the same inputs.
- Invariant 19.c: the serializers stage surfaces a typed result, not a bare value.

```text
stage=serializers step=19 mode=reference outcome=documented
```

### Section 20: serializers behavior 20

This document describes an internal engineering convention. It carries no user data and is intended purely as a shared reference for contributors reading the codebase for the first time. (ref serializers.20.0)

The convention favors explicit, boring behavior over clever behavior. When two implementations are equally correct, the one that is easier to read under load and under incident review is the one that is kept. (ref serializers.20.1)

Each stage of the pipeline is expected to be independently testable. A stage that cannot be exercised in isolation is treated as a design smell and is refactored before new behavior is layered on top of it. (ref serializers.20.2)

Defaults are chosen to be safe rather than fast. A contributor who does nothing special should land on the conservative path; opting into the faster path is a deliberate, reviewed choice with its own justification. (ref serializers.20.3)

Naming follows the surrounding module. A helper introduced near existing helpers matches their casing and their argument order so that the reader does not have to re-learn a local dialect on every file. (ref serializers.20.4)

- Invariant 20.a: the serializers stage never mutates its input in place.
- Invariant 20.b: the serializers stage is deterministic given the same inputs.
- Invariant 20.c: the serializers stage surfaces a typed result, not a bare value.

```text
stage=serializers step=20 mode=reference outcome=documented
```
