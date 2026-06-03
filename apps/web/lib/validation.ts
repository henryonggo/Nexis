import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8, "Kata sandi minimal 8 karakter")
  .regex(/[A-Z]/, "Harus mengandung huruf besar")
  .regex(/[0-9]/, "Harus mengandung angka");

export const signUpSchema = z.object({
  fullName: z.string().min(2, "Nama terlalu pendek"),
  email: z.string().email("Email tidak valid"),
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: z.string().email("Email tidak valid"),
  password: z.string().min(1, "Kata sandi wajib diisi"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Email tidak valid"),
});

export const resetPasswordSchema = z.object({
  password: passwordSchema,
});

export const createCompanySchema = z.object({
  name: z.string().min(2, "Nama perusahaan minimal 2 karakter").max(120),
  industry: z.string().max(80).optional(),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
