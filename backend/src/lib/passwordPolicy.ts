import { z } from "zod";

// Esquema de validación para contraseñas robustas
export const passwordSchema = z.string()
  .min(12, "La contraseña debe tener al menos 12 caracteres")
  .regex(/[A-Z]/, "La contraseña debe contener al menos una mayúscula")
  .regex(/[a-z]/, "La contraseña debe contener al menos una minúscula")
  .regex(/\d/, "La contraseña debe contener al menos un número")
  .regex(/[!@#$%^&*(),.?":{}|<>]/, "La contraseña debe contener al menos un carácter especial")
  .refine(
    (password) => !password.toLowerCase().includes("password"),
    "La contraseña no puede contener la palabra 'password'"
  )
  .refine(
    (password) => !password.toLowerCase().includes("admin"),
    "La contraseña no puede contener la palabra 'admin'"
  )
  .refine(
    (password) => {
      // No secuencias comunes
      const sequences = ["123456", "qwerty", "abcdef", "111111", "000000"];
      return !sequences.some(seq => password.toLowerCase().includes(seq));
    },
    "La contraseña no puede contener secuencias comunes"
  );

export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const result = passwordSchema.safeParse(password);
  
  if (result.success) {
    return { valid: true, errors: [] };
  }
  
  return {
    valid: false,
    errors: result.error.issues.map(issue => issue.message)
  };
}

export function getPasswordStrength(password: string): {
  score: number;
  feedback: string[];
  color: "red" | "orange" | "yellow" | "green";
} {
  const feedback: string[] = [];
  let score = 0;

  // Longitud
  if (password.length >= 12) score += 20;
  else feedback.push("Añade más caracteres (mínimo 12)");

  // Mayúsculas
  if (/[A-Z]/.test(password)) score += 20;
  else feedback.push("Añade una mayúscula");

  // Minúsculas
  if (/[a-z]/.test(password)) score += 20;
  else feedback.push("Añade una minúscula");

  // Números
  if (/\d/.test(password)) score += 20;
  else feedback.push("Añade un número");

  // Caracteres especiales
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 20;
  else feedback.push("Añade un carácter especial");

  // Longitud extra
  if (password.length >= 16) score += 10;
  if (password.length >= 20) score += 10;

  let color: "red" | "orange" | "yellow" | "green" = "red";
  if (score >= 80) color = "green";
  else if (score >= 60) color = "yellow";
  else if (score >= 40) color = "orange";

  return { score: Math.min(100, score), feedback, color };
}

// Lista de contraseñas comunes para rechazar
export const commonPasswords = [
  "password", "123456", "123456789", "qwerty", "abc123", "password123",
  "admin", "letmein", "welcome", "monkey", "1234567890", "qwerty123",
  "password1", "123123", "qwertyuiop", "12345678", "iloveyou", "princess"
];

export function isCommonPassword(password: string): boolean {
  return commonPasswords.includes(password.toLowerCase());
}
