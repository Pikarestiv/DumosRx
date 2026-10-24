import * as z from "zod";

export const adminSchema = z
  .object({
    first_name: z
      .string()
      .min(2, { message: "First name must be at least 2 characters" }),
    last_name: z
      .string()
      .min(2, { message: "Last name must be at least 2 characters" }),
    email: z.string().email({ message: "Invalid email address" }),
    phone: z.string().optional(),
    role: z.string().min(2, { message: "Pick a platform role" }),
    password: z
      .string()
      .min(8, { message: "Password must be at least 8 characters" })
      .regex(/[A-Za-z]/, { message: "Password must contain at least one letter" })
      .regex(/[0-9]/, { message: "Password must contain at least one number" }),
    password_confirmation: z.string(),
  })
  .refine((data) => data.password === data.password_confirmation, {
    message: "Passwords do not match",
    path: ["password_confirmation"],
  });

export type AdminFormValues = z.infer<typeof adminSchema>;
