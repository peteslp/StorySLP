import { contrastText, initials } from "@/lib/storyslp";
import { cn } from "@/lib/utils";

interface StudentChipProps {
  name: string;
  color: string;
  id?: number;
  variant?: "dot" | "pill" | "badge";
  showName?: boolean;
  className?: string;
}

// A consistent identity chip that uses the student's hex color everywhere.
export function StudentChip({
  name,
  color,
  id,
  variant = "pill",
  showName = true,
  className,
}: StudentChipProps) {
  const testId = id !== undefined ? `chip-student-${id}` : undefined;

  if (variant === "dot") {
    return (
      <span
        className={cn("inline-flex items-center gap-1.5", className)}
        data-testid={testId}
      >
        <span
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        {showName && <span className="truncate">{name}</span>}
      </span>
    );
  }

  if (variant === "badge") {
    // a circular initials avatar
    return (
      <span
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold shrink-0",
          className,
        )}
        style={{ backgroundColor: color, color: contrastText(color) }}
        title={name}
        data-testid={testId}
      >
        {initials(name)}
      </span>
    );
  }

  // pill
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        className,
      )}
      style={{ backgroundColor: color, color: contrastText(color) }}
      data-testid={testId}
    >
      {showName ? name : initials(name)}
    </span>
  );
}
