-- Migration 006: Extended profile attributes
-- Run in Supabase SQL Editor

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS sport_type    TEXT CHECK (sport_type    IN ('ski','snowboard','both')),
  ADD COLUMN IF NOT EXISTS skill_level   TEXT CHECK (skill_level   IN ('green','blue','black','double_black','experts_only')),
  ADD COLUMN IF NOT EXISTS vehicle_label TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_seats INTEGER CHECK (vehicle_seats BETWEEN 1 AND 8);
