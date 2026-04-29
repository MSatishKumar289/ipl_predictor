export type FallbackIssue = {
  title: string;
  message: string;
};

function messageFromUnknown(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "");
}

export function resolveFallbackIssue(error: unknown): FallbackIssue | null {
  const message = messageFromUnknown(error);
  const normalized = message.toLowerCase();

  if (
    normalized.includes("resource_exhausted") ||
    normalized.includes("quota exceeded")
  ) {
    return {
      title: "Service Busy",
      message:
        "Server limit reached. Please try again after 12:30 PM IST.",
    };
  }

  if (
    normalized.includes("unavailable") ||
    normalized.includes("deadline_exceeded") ||
    normalized.includes("network") ||
    normalized.includes("failed to fetch")
  ) {
    return {
      title: "Temporary Connection Issue",
      message: "Please try again after some time.",
    };
  }

  return null;
}

