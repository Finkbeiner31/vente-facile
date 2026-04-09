
-- Add system_name column
ALTER TABLE public.commercial_zones
  ADD COLUMN system_name text;

-- Rename name to custom_label
ALTER TABLE public.commercial_zones
  RENAME COLUMN name TO custom_label;

-- Populate system_name for existing zones based on creation order
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM public.commercial_zones
)
UPDATE public.commercial_zones z
SET system_name = 'Zone ' || n.rn
FROM numbered n
WHERE z.id = n.id;

-- Now set NOT NULL
ALTER TABLE public.commercial_zones
  ALTER COLUMN system_name SET NOT NULL;

-- Allow custom_label to be nullable (optional label)
ALTER TABLE public.commercial_zones
  ALTER COLUMN custom_label DROP NOT NULL;
