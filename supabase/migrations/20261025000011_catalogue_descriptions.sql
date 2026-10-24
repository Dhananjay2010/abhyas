-- Catalogue Descriptions Correctness Fixes
-- This migration is idempotent (safe to re-run)

-- ============================================================================
-- Part 1: Fix isometric-chest-squeezes impact level
-- ============================================================================
-- Isometric holds should be low impact, not high impact

UPDATE exercises SET impact = 'low'
WHERE slug = 'isometric-chest-squeezes' AND impact = 'high';
