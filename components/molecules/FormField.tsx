import { Label } from "@/components/atoms/Label";
import { ErrorText } from "@/components/atoms/ErrorText";

interface FormFieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

export function FormField({ id, label, hint, error, children }: FormFieldProps) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
