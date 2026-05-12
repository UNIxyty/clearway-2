-- Fix the email_confirmations purpose CHECK constraint.
-- The original constraint only allowed exact values 'signup' or 'password_reset',
-- but the server updates purpose to 'signup:<userId>' after a successful invite.
-- Run once in Supabase SQL Editor.

alter table public.email_confirmations
  drop constraint if exists email_confirmations_purpose_check;

alter table public.email_confirmations
  add constraint email_confirmations_purpose_check
  check (purpose = 'password_reset' or purpose like 'signup%');
