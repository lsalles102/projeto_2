import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface PasswordValidatorProps {
  password: string;
  className?: string;
  showTitle?: boolean;
}

interface ValidationRule {
  id: string;
  label: string;
  test: (password: string) => boolean;
}

const validationRules: ValidationRule[] = [
  {
    id: "length",
    label: "Pelo menos 8 caracteres",
    test: (password) => password.length >= 8,
  },
  {
    id: "lowercase",
    label: "1 letra minúscula (a-z)",
    test: (password) => /[a-z]/.test(password),
  },
  {
    id: "uppercase",
    label: "1 letra maiúscula (A-Z)",
    test: (password) => /[A-Z]/.test(password),
  },
  {
    id: "number",
    label: "1 número (0-9)",
    test: (password) => /\d/.test(password),
  },
  {
    id: "special",
    label: "1 caractere especial (@$!%*?&)",
    test: (password) => /[@$!%*?&]/.test(password),
  },
];

export function PasswordValidator({ password, className, showTitle = true }: PasswordValidatorProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {showTitle && (
        <p className="text-xs text-gray-400 font-medium">
          A senha deve conter:
        </p>
      )}
      <div className="space-y-1">
        {validationRules.map((rule) => {
          const isValid = rule.test(password);
          return (
            <div
              key={rule.id}
              className={cn(
                "flex items-center gap-2 text-xs transition-colors duration-200",
                isValid 
                  ? "text-green-500 dark:text-green-400" 
                  : "text-gray-400 dark:text-gray-500"
              )}
            >
              {isValid ? (
                <Check className="w-3 h-3 text-green-500" />
              ) : (
                <X className="w-3 h-3 text-gray-400" />
              )}
              <span className={cn(
                "transition-all duration-200",
                isValid && "font-medium"
              )}>
                {rule.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  const validCount = validationRules.filter(rule => rule.test(password)).length;
  const score = (validCount / validationRules.length) * 100;

  if (score === 100) {
    return { score, label: "Muito forte", color: "text-green-500" };
  } else if (score >= 80) {
    return { score, label: "Forte", color: "text-blue-500" };
  } else if (score >= 60) {
    return { score, label: "Moderada", color: "text-yellow-500" };
  } else if (score >= 40) {
    return { score, label: "Fraca", color: "text-orange-500" };
  } else {
    return { score, label: "Muito fraca", color: "text-red-500" };
  }
}

export function isPasswordValid(password: string): boolean {
  return validationRules.every(rule => rule.test(password));
}