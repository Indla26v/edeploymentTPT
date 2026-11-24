-- Extensions used by later phases:
--   btree_gist: exclusion constraint on plan_personnel (person_id WITH =, duty_window WITH &&)
--               so the same officer can never be booked on two overlapping bandobasts.
-- Both are available on Neon and on stock PostgreSQL contrib.
CREATE EXTENSION IF NOT EXISTS btree_gist;
