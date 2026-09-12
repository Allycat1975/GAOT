# Guardian governance boundary

Executor, Critic, and Guardian are distinct operating functions. An Executor
cannot accept its own output. Critic review is independent, and final
acceptance requires an explicit Guardian verdict bound to the exact WorkUnit,
Run, evidence, and rationale.

Paperclip approval records are not Guardian decisions and cannot map directly
to accepted work. Business credentials remain behind a Tool Gateway, which
must verify a Mycelium authorization envelope with the company, WorkUnit, Run,
capability, payload hash, expiry, and replay protection before side effects.

Plugins, routines, skills, and adapter configuration cannot override the
Constitution, Role Factory authority, Tool Gateway, or Guardian controls.
