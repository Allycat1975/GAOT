-- A completed run has exactly one independent Critic disposition. The
-- command service advances lifecycle state and emits audit/outbox records in
-- the same transaction; this constraint closes the concurrent duplicate path.
ALTER TABLE mycelium.critic_reviews
  ADD CONSTRAINT mycelium_critic_reviews_run_unique UNIQUE (run_id);
