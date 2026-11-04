"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import type { ActionResult } from "@/lib/action-result";

type Action = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

/** Formulário ligado a uma Server Action com feedback de sucesso/erro. */
export function ActionForm({
  action,
  children,
  className = "space-y-4",
  resetOnSuccess = false,
  showSuccess = true,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  showSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={formRef} action={formAction} className={className}>
      {children}
      {state && (!state.ok || showSuccess) && state.message ? (
        <div className="basis-full">
          <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>
        </div>
      ) : null}
    </form>
  );
}

export function SubmitButton({ children, pendingLabel = "A guardar…", ...props }: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
