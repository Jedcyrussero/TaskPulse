import { z } from 'zod';

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Email is required')
  .max(254)
  .email('Enter a valid email address');

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long');

const displayName = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(80, 'Name must be 80 characters or fewer');

const city = z.string().trim().min(1).max(120).optional();
const country = z.string().trim().min(1).max(120).optional();

export const registerSchema = z.object({
  email,
  password,
  displayName,
  city,
  country,
});

export const loginSchema = z.object({
  email,
  // Not length-constrained: legacy hashes should still be able to sign in.
  password: z.string().min(1, 'Password is required'),
});

export const updateProfileSchema = z
  .object({
    displayName,
    city,
    country,
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update',
  });