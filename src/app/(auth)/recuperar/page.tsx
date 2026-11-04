"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset } from "../actions";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

export default function RecoverPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, null);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Recuperar palavra-passe</h1>
      <p className="text-ink-muted">Indique o seu email. Enviaremos uma ligação para definir uma nova palavra-passe.</p>
      <form action={action} className="space-y-4">
        <Field label="Email" htmlFor="email">
          <TextInput id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
        </Field>
        {state ? <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice> : null}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "A enviar…" : "Enviar ligação"}
        </Button>
      </form>
      <p className="text-center text-sm">
        <Link href="/login" className="font-semibold text-accent underline-offset-4 hover:underline">
          Voltar a entrar
        </Link>
      </p>
    </div>
  );
}
