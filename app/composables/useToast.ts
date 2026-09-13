import { useState } from "#app";

let hideTimeoutId: ReturnType<typeof setTimeout> | undefined;

export function useToast() {
  const message = useState<string | null>("toast-message", () => null);

  function showToast(text: string): void {
    message.value = text;
    if (hideTimeoutId) clearTimeout(hideTimeoutId);
    hideTimeoutId = setTimeout(() => {
      message.value = null;
    }, 2200);
  }

  return { message, showToast };
}
